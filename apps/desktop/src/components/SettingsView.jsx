export default function SettingsView({ settings, onChange, onSave }) {
  return (
    <section className="settings-view">
      <header className="section-heading">
        <div>
          <p>Settings</p>
          <h2>Local workspace</h2>
        </div>
      </header>
      <label>
        API endpoint
        <input value={settings.apiEndpoint || ''} onChange={(event) => onChange({ ...settings, apiEndpoint: event.target.value })} />
      </label>
      <label>
        Global hotkey
        <input value={settings.hotkey || ''} onChange={(event) => onChange({ ...settings, hotkey: event.target.value })} />
      </label>
      <label>
        Storage location
        <input value={settings.storageLocation || ''} onChange={(event) => onChange({ ...settings, storageLocation: event.target.value })} />
      </label>
      <p className="schema-note">
        Local schema mirrors the web API annotations, users, comments, likes, pins and follows tables, with synced_at and conflict_version on locally mutable records.
      </p>
      <button className="button button-solid" onClick={() => onSave(settings)}>Save settings</button>
    </section>
  );
}
