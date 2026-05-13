fn main() {
    #[cfg(target_os = "macos")]
    {
        use std::{env, fs, path::PathBuf, process::Command};

        let manifest_dir =
            PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
        let source = manifest_dir.join("native").join("AnnotatedCapture.swift");
        let info_plist = manifest_dir.join("Info.plist");
        let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
        let helper = out_dir.join("annotated-capture");
        let target = env::var("TARGET").expect("TARGET");
        let sidecar_name = format!("annotated-capture-{}", target);
        let sidecar_dir = manifest_dir.join("binaries");
        let sidecar = sidecar_dir.join(&sidecar_name);

        println!("cargo:rerun-if-changed={}", source.display());
        println!("cargo:rustc-env=ANNOTATED_CAPTURE_SIDECAR={}", sidecar_name);
        if source.exists() {
            let _ = fs::create_dir_all(&out_dir);
            let _ = fs::create_dir_all(&sidecar_dir);
            let mut args = vec![
                "swiftc".to_string(),
                "-O".to_string(),
                "-parse-as-library".to_string(),
                "-framework".to_string(),
                "ScreenCaptureKit".to_string(),
                "-framework".to_string(),
                "AVFoundation".to_string(),
                "-framework".to_string(),
                "CoreMedia".to_string(),
                "-framework".to_string(),
                "CoreGraphics".to_string(),
                "-framework".to_string(),
                "CoreVideo".to_string(),
                "-o".to_string(),
                sidecar.to_string_lossy().to_string(),
            ];
            if info_plist.exists() {
                args.extend([
                    "-Xlinker".to_string(),
                    "-sectcreate".to_string(),
                    "-Xlinker".to_string(),
                    "__TEXT".to_string(),
                    "-Xlinker".to_string(),
                    "__info_plist".to_string(),
                    "-Xlinker".to_string(),
                    info_plist.to_string_lossy().to_string(),
                ]);
            }
            args.push(source.to_string_lossy().to_string());
            let status = Command::new("xcrun").args(args).status();
            match status {
                Ok(result) if result.success() => {
                    let _ = fs::copy(&sidecar, &helper);
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = fs::set_permissions(&sidecar, fs::Permissions::from_mode(0o755));
                        let _ = fs::set_permissions(&helper, fs::Permissions::from_mode(0o755));
                    }
                    println!(
                        "cargo:rustc-env=ANNOTATED_CAPTURE_HELPER={}",
                        helper.display()
                    );
                }
                Ok(result) => {
                    println!(
                        "cargo:warning=Annotated native capture helper did not compile: {}",
                        result
                    );
                }
                Err(error) => {
                    println!(
                        "cargo:warning=Could not run swiftc for native capture helper: {}",
                        error
                    );
                }
            }
        }
    }
    tauri_build::build()
}
