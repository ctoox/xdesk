import { exec, spawn, ChildProcess } from 'child_process';

export function executeCommand(command: string): Promise<string> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Use PowerShell with UTF-8 encoding
      const ps = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';

      ps.stdout?.on('data', (data) => {
        stdout += data.toString('utf8');
      });

      ps.stderr?.on('data', (data) => {
        stderr += data.toString('utf8');
      });

      ps.on('close', () => {
        resolve(stdout || stderr || 'Command executed');
      });

      ps.on('error', (err) => {
        resolve(`Error: ${err.message}`);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        ps.kill();
        resolve('Command timed out');
      }, 30000);
    } else {
      exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          resolve(stderr || err.message);
        } else {
          resolve(stdout || stderr || 'Command executed');
        }
      });
    }
  });
}
