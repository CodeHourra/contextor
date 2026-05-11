export type Reporter = {
  info(message: string): void;
  warn(message: string): void;
  success(message: string): void;
  error(message: string): void;
  confirm(prompt: string): Promise<boolean>;
  prompt(prompt: string, defaultValue?: string): Promise<string>;
  selectOne<T extends { label: string; value: unknown }>(
    prompt: string,
    choices: T[],
  ): Promise<T['value']>;
  multiSelect<T extends { label: string; value: unknown; checked?: boolean }>(
    prompt: string,
    choices: T[],
  ): Promise<T['value'][]>;
  progress?(stage: string, current: number, total: number): void;
};

export type ProjectRow = {
  id: number;
  alias: string;
  remote_url: string | null;
  root_path_hint: string | null;
  created_at: number;
  updated_at: number;
};
