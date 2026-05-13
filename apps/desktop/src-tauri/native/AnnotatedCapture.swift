import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import ScreenCaptureKit

struct CaptureOptions {
    let outputPath: String
    let duration: TimeInterval
    let microphone: Bool
    let systemAudio: Bool
    let displayIndex: Int
}

struct CapturePayload: Codable {
    let ok: Bool
    let outputPath: String?
    let duration: Double
    let microphone: Bool
    let systemAudio: Bool
    let error: String?
}

@available(macOS 13.0, *)
final class ScreenRecorder: NSObject, SCStreamDelegate, SCStreamOutput, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let options: CaptureOptions
    private let queue = DispatchQueue(label: "com.annotated.capture.samples")
    private var stream: SCStream?
    private var writer: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var systemAudioInput: AVAssetWriterInput?
    private var micAudioInput: AVAssetWriterInput?
    private var micSession: AVCaptureSession?
    private var firstSampleTime: CMTime?
    private var startWallTime: Date?
    private var stopping = false
    private var finished = false

    init(options: CaptureOptions) {
        self.options = options
        super.init()
    }

    func start() async throws {
        if options.microphone {
            let granted = await AVCaptureDevice.requestAccess(for: .audio)
            if !granted {
                throw CaptureError("Microphone permission was not granted")
            }
        }

        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard !content.displays.isEmpty else {
            throw CaptureError("No capturable display was found")
        }
        let display = content.displays[min(max(options.displayIndex, 0), content.displays.count - 1)]
        let filter = SCContentFilter(display: display, excludingWindows: [])

        let nativeWidth = max(640, Double(display.width))
        let nativeHeight = max(360, Double(display.height))
        let captureScale = min(1, 1920 / nativeWidth)
        let width = max(640, Int(nativeWidth * captureScale) / 2 * 2)
        let height = max(360, Int(nativeHeight * captureScale) / 2 * 2)

        let writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: options.outputPath), fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true

        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 3_000_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
            ]
        ]
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput.expectsMediaDataInRealTime = true
        if writer.canAdd(videoInput) {
            writer.add(videoInput)
        }

        let audioSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 48_000,
            AVNumberOfChannelsKey: 2,
            AVEncoderBitRateKey: 128_000
        ]
        if options.systemAudio {
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            input.expectsMediaDataInRealTime = true
            if writer.canAdd(input) {
                writer.add(input)
                systemAudioInput = input
            }
        }
        if options.microphone {
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            input.expectsMediaDataInRealTime = true
            if writer.canAdd(input) {
                writer.add(input)
                micAudioInput = input
            }
        }

        self.writer = writer
        self.videoInput = videoInput

        let configuration = SCStreamConfiguration()
        configuration.width = width
        configuration.height = height
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        configuration.showsCursor = true
        configuration.capturesAudio = options.systemAudio
        configuration.sampleRate = 48_000
        configuration.channelCount = 2

        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        if options.systemAudio {
            try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        }
        self.stream = stream

        if options.microphone {
            try startMicrophoneCapture()
        }

        startWallTime = Date()
        try await stream.startCapture()
    }

    func stop() async {
        await withCheckedContinuation { continuation in
            queue.async {
                self.stopOnQueue {
                    continuation.resume()
                }
            }
        }
    }

    private func stopOnQueue(completion: @escaping () -> Void) {
        if finished {
            completion()
            return
        }
        stopping = true
        finished = true

        micSession?.stopRunning()
        micSession = nil

        Task {
            try? await stream?.stopCapture()
            stream = nil
            queue.async {
                self.videoInput?.markAsFinished()
                self.systemAudioInput?.markAsFinished()
                self.micAudioInput?.markAsFinished()
                if let writer = self.writer, writer.status == .writing {
                    writer.finishWriting {
                        completion()
                    }
                } else {
                    completion()
                }
            }
        }
    }

    private func startMicrophoneCapture() throws {
        guard let device = AVCaptureDevice.default(for: .audio) else {
            throw CaptureError("No default microphone was found")
        }
        let session = AVCaptureSession()
        let input = try AVCaptureDeviceInput(device: device)
        if session.canAddInput(input) {
            session.addInput(input)
        }
        let output = AVCaptureAudioDataOutput()
        output.setSampleBufferDelegate(self, queue: queue)
        if session.canAddOutput(output) {
            session.addOutput(output)
        }
        session.startRunning()
        micSession = session
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard sampleBuffer.isValid, !stopping else {
            return
        }
        append(sampleBuffer, mediaType: type == .audio ? .systemAudio : .video)
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard sampleBuffer.isValid, !stopping else {
            return
        }
        append(sampleBuffer, mediaType: .microphone)
    }

    private func append(_ sampleBuffer: CMSampleBuffer, mediaType: SampleKind) {
        guard let writer = writer else {
            return
        }
        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        if firstSampleTime == nil {
            firstSampleTime = presentationTime
            writer.startWriting()
            writer.startSession(atSourceTime: presentationTime)
        }
        guard writer.status == .writing else {
            return
        }

        switch mediaType {
        case .video:
            if videoInput?.isReadyForMoreMediaData == true {
                videoInput?.append(sampleBuffer)
            }
        case .systemAudio:
            if systemAudioInput?.isReadyForMoreMediaData == true {
                systemAudioInput?.append(sampleBuffer)
            }
        case .microphone:
            if micAudioInput?.isReadyForMoreMediaData == true {
                micAudioInput?.append(sampleBuffer)
            }
        }
    }
}

@available(macOS 13.0, *)
extension ScreenRecorder: @unchecked Sendable {}

enum SampleKind {
    case video
    case systemAudio
    case microphone
}

struct CaptureError: Error, CustomStringConvertible {
    let description: String

    init(_ description: String) {
        self.description = description
    }
}

@available(macOS 13.0, *)
final class AppState {
    static var recorder: ScreenRecorder?
    static var finished = false
    static var options: CaptureOptions?
    static var startedAt: Date?
    static let lock = NSLock()

    static func finish(ok: Bool, error: String? = nil) {
        lock.lock()
        if finished {
            lock.unlock()
            return
        }
        finished = true
        let options = self.options
        let elapsed = startedAt.map { max(1, Date().timeIntervalSince($0)) } ?? (options?.duration ?? 0)
        lock.unlock()

        let payload = CapturePayload(
            ok: ok,
            outputPath: ok ? options?.outputPath : nil,
            duration: elapsed,
            microphone: options?.microphone ?? false,
            systemAudio: options?.systemAudio ?? false,
            error: error
        )
        if let data = try? JSONEncoder().encode(payload),
           let line = String(data: data, encoding: .utf8) {
            print(line)
        }
        fflush(stdout)
        exit(ok ? 0 : 1)
    }
}

func boolArg(_ value: String?) -> Bool {
    guard let value else {
        return false
    }
    return ["1", "true", "yes", "on"].contains(value.lowercased())
}

func value(after flag: String, in args: [String]) -> String? {
    guard let index = args.firstIndex(of: flag), index + 1 < args.count else {
        return nil
    }
    return args[index + 1]
}

@main
struct AnnotatedCapture {
    static func main() async {
        if #available(macOS 13.0, *) {
            await run()
        } else {
            let payload = CapturePayload(ok: false, outputPath: nil, duration: 0, microphone: false, systemAudio: false, error: "Screen capture requires macOS 13 or newer")
            if let data = try? JSONEncoder().encode(payload),
               let line = String(data: data, encoding: .utf8) {
                print(line)
            }
            exit(1)
        }
    }

    @available(macOS 13.0, *)
    static func run() async {
        let args = Array(CommandLine.arguments.dropFirst())
        if args.contains("--preflight") {
            AppState.options = CaptureOptions(outputPath: "", duration: 0, microphone: false, systemAudio: true, displayIndex: 0)
            AppState.finish(ok: true)
        }

        guard let outputPath = value(after: "--output", in: args) else {
            AppState.finish(ok: false, error: "--output is required")
            return
        }

        let duration = TimeInterval(Double(value(after: "--duration", in: args) ?? "90") ?? 90)
        let microphone = boolArg(value(after: "--microphone", in: args))
        let systemAudio = boolArg(value(after: "--system-audio", in: args))
        let displayIndex = Int(value(after: "--display-index", in: args) ?? "0") ?? 0

        let options = CaptureOptions(
            outputPath: outputPath,
            duration: min(max(duration, 1), 90),
            microphone: microphone,
            systemAudio: systemAudio,
            displayIndex: displayIndex
        )
        AppState.options = options

        let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
        signal(SIGINT, SIG_IGN)
        sigint.setEventHandler {
            Task {
                await AppState.recorder?.stop()
                AppState.finish(ok: true)
            }
        }
        sigint.resume()

        let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        signal(SIGTERM, SIG_IGN)
        sigterm.setEventHandler {
            Task {
                await AppState.recorder?.stop()
                AppState.finish(ok: true)
            }
        }
        sigterm.resume()

        do {
            let recorder = ScreenRecorder(options: options)
            AppState.recorder = recorder
            try await recorder.start()
            AppState.startedAt = Date()
            DispatchQueue.main.asyncAfter(deadline: .now() + options.duration) {
                Task {
                    await recorder.stop()
                    AppState.finish(ok: true)
                }
            }
            while true {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        } catch {
            AppState.finish(ok: false, error: String(describing: error))
        }
    }
}
