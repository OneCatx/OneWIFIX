/** OneBoard localStorage key constants (onebord → oneboard). */

export const STORAGE_KEYS = {
  theme: 'oneboard-theme-mode',
  skin: 'oneboard-skin',
  authToken: 'oneboard-auth-token',
  authUser: 'oneboard-auth-user',
  clashBackend: 'oneboard-clash-backend',
  clashAuthMode: 'oneboard-clash-auth-mode',
  onewifiConnection: 'oneboard-onewifi-connection',
  onewifiActiveInstance: 'oneboard:onewifi:active-instance-id',
  onewifiInstances: 'oneboard:onewifi:instances',
  onewifiToken: 'oneboard:onewifi:token',
  onewifiUsername: 'oneboard:onewifi:username',
  rulesEditor: 'oneboard-rules-editor',
  wifiState: 'oneboard-wifi-state',
  remoteYamlPrefix: 'oneboard-remote-yaml',
  configYaml: 'oneboard:config-yaml',
  migrationFlag: 'oneboard:storage-migrated-v1',
}

/** 皮名 onebord → oneboard（v1 已跑过的浏览器不再走这张表）。 */
export const LEGACY_STORAGE_KEY_MAP = {
  'onebord-theme-mode': STORAGE_KEYS.theme,
  'onebord-auth-token': STORAGE_KEYS.authToken,
  'onebord-auth-user': STORAGE_KEYS.authUser,
  'onebord-clash-backend': STORAGE_KEYS.clashBackend,
  'onebord-rules-editor': STORAGE_KEYS.rulesEditor,
  'onebord-wifi-state': STORAGE_KEYS.wifiState,
  'onebord:config-yaml': STORAGE_KEYS.configYaml,
}

export const LEGACY_STORAGE_PREFIX_MAP = {
  'onebord-remote-yaml:': `${STORAGE_KEYS.remoteYamlPrefix}:`,
}
