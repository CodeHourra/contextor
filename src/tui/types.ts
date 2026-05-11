/** TUI 路由名：主菜单 + spec §6.5 所列各命令屏（含 CLI 对齐的 gc / rename / remove）。 */
export type ScreenName =
  | 'main'
  | 'init'
  | 'save'
  | 'restore'
  | 'add'
  | 'rm'
  | 'ls'
  | 'status'
  | 'diff'
  | 'projects'
  | 'link'
  | 'rules'
  | 'trash'
  | 'doctor'
  | 'gc'
  | 'rename'
  | 'remove';
