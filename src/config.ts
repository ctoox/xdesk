import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Config {
  signal_server: string;
  room: string;
  fps: number;
  quality: number;
  proxy: string | null;
}

const DEFAULT_CONFIG: Config = {
  signal_server: 'wss://xdesk.ctoocn.workers.dev/ws?room=test',
  room: 'default',
  fps: 15,
  quality: 3,
  proxy: null,
};

export function loadConfig(): Config {
  const configPaths = [
    // Current directory
    path.join(process.cwd(), 'xdesk.json'),
    // User home directory
    path.join(os.homedir(), '.xdesk', 'config.json'),
    // Executable directory
    path.join(path.dirname(process.execPath), 'xdesk.json'),
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(data);
        console.log('Config loaded from: ' + configPath);
        return { ...DEFAULT_CONFIG, ...config };
      }
    } catch (e) {
      // Ignore invalid config files
    }
  }

  console.log('Using default config');
  return DEFAULT_CONFIG;
}

export function saveConfig(config: Config, configPath?: string): void {
  const targetPath = configPath || path.join(os.homedir(), '.xdesk', 'config.json');
  const dir = path.dirname(targetPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(targetPath, JSON.stringify(config, null, 2));
  console.log('Config saved to: ' + targetPath);
}
