import type { ScreenName } from '../types.js';

export const PROJECT_BOUND = new Set<ScreenName>([
  'save',
  'restore',
  'add',
  'rm',
  'ls',
  'status',
  'diff',
]);

export const ALL_ITEMS = [
  { label: 'init       初始化当前目录', value: 'init' as const },
  { label: 'save       保存当前项目配置', value: 'save' as const },
  { label: 'restore    还原项目配置', value: 'restore' as const },
  { label: 'add        添加文件到管理', value: 'add' as const },
  { label: 'rm         移除文件', value: 'rm' as const },
  { label: 'ls         查看受管文件', value: 'ls' as const },
  { label: 'status     查看状态', value: 'status' as const },
  { label: 'diff       查看差异', value: 'diff' as const },
  { label: '────────', value: '__sep__' as const },
  { label: 'projects   管理所有项目', value: 'projects' as const },
  { label: 'link       绑定到已有项目', value: 'link' as const },
  { label: 'rename     重命名项目', value: 'rename' as const },
  { label: 'remove     删除项目', value: 'remove' as const },
  { label: 'rules      管理全局规则', value: 'rules' as const },
  { label: 'trash      回收站', value: 'trash' as const },
  { label: 'doctor     系统自检', value: 'doctor' as const },
  { label: 'gc         清理孤儿 blob', value: 'gc' as const },
  { label: 'quit', value: 'quit' as const },
] as const;
