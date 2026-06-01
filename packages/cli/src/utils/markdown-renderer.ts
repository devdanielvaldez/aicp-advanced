import chalk from 'chalk';
import hljs from 'highlight.js';

function highlightCode(code: string, lang?: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return code;
  }
}

export function renderMarkdown(md: string): string {
  let result = '';
  const lines = md.split('\n');
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = '';
        continue;
      } else {
        inCodeBlock = false;
        const highlighted = highlightCode(codeBlockContent, codeBlockLang);
        result += `\n${chalk.gray('```' + codeBlockLang)}\n${highlighted}\n${chalk.gray('```')}\n`;
        continue;
      }
    }
    if (inCodeBlock) {
      codeBlockContent += line + '\n';
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const colors: Record<number, typeof chalk> = {1: chalk.cyan, 2: chalk.green, 3: chalk.yellow, 4: chalk.blue, 5: chalk.magenta, 6: chalk.white};
      const color = colors[level] || chalk.white;
      result += `\n${color.bold(text)}\n${chalk.gray('─'.repeat(Math.min(text.length, 80)))}\n`;
      continue;
    }
    if (line.match(/^\s*[-*+]\s+/)) {
      const content = line.replace(/^\s*[-*+]\s+/, '');
      result += `  ${chalk.gray('•')} ${content}\n`;
      continue;
    }
    const inlineCodeRegex = /`([^`]+)`/g;
    line = line.replace(inlineCodeRegex, (_, code) => chalk.bgGray.white(code));
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    line = line.replace(linkRegex, (_, text, url) => chalk.blue.underline(text));
    line = line.replace(/\*\*\*([^*]+)\*\*\*/g, (_, t) => chalk.bold.italic(t));
    line = line.replace(/\*\*([^*]+)\*\*/g, (_, t) => chalk.bold(t));
    line = line.replace(/\*([^*]+)\*/g, (_, t) => chalk.italic(t));
    if (line.trim() === '') {
      result += '\n';
      continue;
    }
    result += line + '\n';
  }
  return result;
}