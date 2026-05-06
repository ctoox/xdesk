import { spawn } from 'child_process';

export function executeCommand(command: string): Promise<string> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Force UTF-8 with chcp 65001
      const psScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; ${command}`;
      
      const ps = spawn('powershell.exe', ['-NoProfile', '-Command', psScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';

      ps.stdout?.setEncoding('utf8');
      ps.stderr?.setEncoding('utf8');

      ps.stdout?.on('data', (data) => {
        stdout += data;
      });

      ps.stderr?.on('data', (data) => {
        stderr += data;
      });

      ps.on('close', () => {
        resolve((stdout || stderr || 'Done').trim());
      });

      ps.on('error', (err) => {
        resolve(`Error: ${err.message}`);
      });

      setTimeout(() => {
        ps.kill();
        resolve('Timeout');
      }, 30000);
    } else {
      const { exec } = require('child_process');
      exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
        resolve((err ? stderr : stdout) || 'Done');
      });
    }
  });
}
