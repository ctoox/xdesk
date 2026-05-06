import { exec, spawn, ChildProcess } from 'child_process';

export class ShellManager {
  private shell: ChildProcess | null = null;
  private outputCallback: ((data: string) => void) | null = null;

  constructor() {}

  start(onOutput: (data: string) => void): void {
    this.outputCallback = onOutput;
    
    const isWindows = process.platform === 'win32';
    const shellCmd = isWindows ? 'powershell.exe' : 'bash';
    
    this.shell = spawn(shellCmd, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'xterm-256color' }
    });

    this.shell.stdout?.on('data', (data) => {
      if (this.outputCallback) {
        this.outputCallback(data.toString());
      }
    });

    this.shell.stderr?.on('data', (data) => {
      if (this.outputCallback) {
        this.outputCallback(data.toString());
      }
    });

    this.shell.on('close', () => {
      this.shell = null;
    });

    if (this.outputCallback) {
      this.outputCallback('Shell started\n');
    }
  }

  execute(command: string): void {
    if (!this.shell) {
      return;
    }
    this.shell.stdin?.write(command + '\n');
  }

  stop(): void {
    if (this.shell) {
      this.shell.kill();
      this.shell = null;
    }
  }

  isRunning(): boolean {
    return this.shell !== null;
  }
}

export function executeCommand(command: string): Promise<string> {
  return new Promise((resolve) => {
    exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        resolve(stderr || err.message);
      } else {
        resolve(stdout || stderr || 'Command executed');
      }
    });
  });
}
