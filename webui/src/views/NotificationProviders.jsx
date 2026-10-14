import React from 'react'
import { api } from '../api.js'
import { destinationSummary, prepareNotificationSettings } from '../notificationDestinations.js'

function DestinationEditor({ name, config, draft, onDraft, t }) {
  const replacing = draft !== undefined
  const count = destinationSummary(config.urls)
  return <div className="u-destination-editor">
    <div className="u-inline"><strong>{t('Saved destinations: {count}', { count })}</strong><button type="button" className="btn btn-ghost" onClick={() => onDraft(name, replacing ? undefined : '')}>{t(replacing ? 'Keep saved destinations' : 'Replace all destinations')}</button></div>
    {replacing ? <label>{t('Complete HTTPS destination list, one URL per line')}<textarea rows="4" value={draft} onChange={e => onDraft(name, e.target.value)} placeholder="https://…" autoComplete="off" spellCheck="false" /></label> : <p className="u-note">{t('Saved URLs are hidden. To edit one, re-enter every URL in the list; unchanged masked URLs are retained on Save.')}</p>}
  </div>
}

function ProviderCard({ name, title, detail, config, drafts, onDraft, setChannel, eventOptions, t, showToast }) {
  const [testing, setTesting] = React.useState(false)
  const test = async () => {
    if (testing) return
    setTesting(true)
    try {
      const ownDraft = Object.hasOwn(drafts, name) ? { [name]: drafts[name] } : {}
      const payload = prepareNotificationSettings({ [name]: config }, ownDraft)[name]
      await (name === 'wecom' ? api.testWecom(payload) : api.testBark(payload))
      showToast(t('Provider accepted the test request; device delivery is not confirmed.'))
    } catch (error) { showToast(t(error.message)) } finally { setTesting(false) }
  }
  return <div className="card u-panel">
    <div className="u-card-head"><div><h2>{title}</h2><p>{t(detail)}</p></div><input type="checkbox" className="u-toggle" aria-label={t('Enable {name}', { name: title })} checked={!!config.enabled} onChange={e => setChannel(name, { enabled: e.target.checked })} /></div>
    <DestinationEditor name={name} config={config} draft={drafts[name]} onDraft={onDraft} t={t} />
    {name === 'wecom' ? <label>{t('WeCom message template (optional)')}<textarea rows="3" value={config.payload_template || ''} onChange={e => setChannel(name, { payload_template: e.target.value })} /></label> : <><div className="u-form-grid"><label>{t('Bark group')}<input value={config.group || ''} onChange={e => setChannel(name, { group: e.target.value })} /></label><label>{t('Bark icon URL')}<input type="url" value={config.icon || ''} onChange={e => setChannel(name, { icon: e.target.value })} /></label></div><label>{t('Interruption level')}<select value={config.level || 'active'} onChange={e => setChannel(name, { level: e.target.value })}><option value="active">active</option><option value="timeSensitive">timeSensitive</option><option value="passive">passive</option><option value="critical">critical</option></select></label></>}
    {eventOptions(name, config)}
    <button type="button" className="btn btn-ghost" disabled={testing} onClick={test} title={t('Sends a real test notification to configured destinations.')}>{t(testing ? 'Testing…' : 'Send test notification')}</button>
  </div>
}

function ApnsCard({ name, title, detail, config, setChannel, t, showToast }) {
  const [testing, setTesting] = React.useState(false)
  const test = async () => {
    setTesting(true)
    try {
      const result = await api.testApnsSms()
      showToast(t('APNs accepted {accepted}/{attempted} requests; delivery is not confirmed.', result))
    } catch (error) { showToast(error.message) } finally { setTesting(false) }
  }
  const field = (key, label, props = {}) => <label key={key}>{t(label)}<input value={config[key] || ''} onChange={e => setChannel(name, { [key]: e.target.value })} {...props} /></label>
  return <div className="card u-panel">
    <div className="u-card-head"><div><h2>{title}</h2><p>{t(detail)}</p></div><input type="checkbox" className="u-toggle" aria-label={t('Enable {name}', { name: title })} checked={!!config.enabled} onChange={e => setChannel(name, { enabled: e.target.checked })} /></div>
    <label>{t('APNs environment')}<select value={config.environment || 'production'} onChange={e => setChannel(name, { environment: e.target.value })}><option value="production">production</option><option value="sandbox">sandbox</option></select></label>
    {field('bundle_id', 'Bundle ID', { autoComplete: 'off' })}
    <div className="u-form-grid">{field('team_id', 'Team ID', { maxLength: 10, autoComplete: 'off' })}{field('key_id', 'Key ID', { maxLength: 10, autoComplete: 'off' })}</div>
    {field('auth_key_path', 'Existing server-side .p8 key path', { type: 'password', autoComplete: 'off' })}
    <p className="u-note">{t('The key must already exist on the OneWIFI host as a readable P-256 .p8 file. Never paste or upload its contents. An unchanged masked path is kept.')}</p>
    {name === 'apns' ? <button type="button" className="btn btn-ghost" disabled={testing || !config.enabled} onClick={test} title={t('Sends a real SMS test to registered endpoints after settings are saved.')}>{t(testing ? 'Testing…' : 'Send SMS APNs test')}</button> : <p className="u-note">{t('VoIP push has no synthetic test: it requires a real ringing call. SMS and VoIP credentials are configured separately.')}</p>}
  </div>
}

export default function NotificationProviders({ settings, drafts, onDraft, setChannel, eventOptions, t, showToast }) {
  return <>
    <ProviderCard name="wecom" title="WeCom" detail="WeCom robot webhook notifications." config={settings.wecom || {}} drafts={drafts} onDraft={onDraft} setChannel={setChannel} eventOptions={eventOptions} t={t} showToast={showToast} />
    <ProviderCard name="bark" title="Bark" detail="Bark notifications through one or more HTTPS endpoints." config={settings.bark || {}} drafts={drafts} onDraft={onDraft} setChannel={setChannel} eventOptions={eventOptions} t={t} showToast={showToast} />
    <ApnsCard name="apns" title="APNs · SMS" detail="SMS and Live Activity update notifications." config={settings.apns || {}} setChannel={setChannel} t={t} showToast={showToast} />
    <ApnsCard name="apns_voip" title="APNs · VoIP" detail="Incoming-call VoIP push notifications." config={settings.apns_voip || {}} setChannel={setChannel} t={t} showToast={showToast} />
  </>
}
