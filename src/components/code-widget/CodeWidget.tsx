import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FiCopy, FiCheck } from 'react-icons/fi';
import './code-widget.scss';

interface CodeWidgetProps {
  code: string;
  language: string;
  onClose: () => void;
}

export const CodeWidget: React.FC<CodeWidgetProps> = ({ code, language, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const getDisplayLanguage = (lang: string): string => {
    const languageMap: { [key: string]: string } = {
      'javascript': 'JavaScript',
      'js': 'JavaScript',
      'typescript': 'TypeScript',
      'ts': 'TypeScript',
      'python': 'Python',
      'py': 'Python',
      'java': 'Java',
      'cpp': 'C++',
      'c': 'C',
      'csharp': 'C#',
      'cs': 'C#',
      'go': 'Go',
      'txt': 'Text',
      'text': 'Text',
      'rust': 'Rust',
      'ruby': 'Ruby',
      'php': 'PHP',
      'swift': 'Swift',
      'kotlin': 'Kotlin',
      'scala': 'Scala',
      'html': 'HTML',
      'css': 'CSS',
      'scss': 'SCSS',
      'sass': 'Sass',
      'sql': 'SQL',
      'bash': 'Bash',
      'shell': 'Shell',
      'sh': 'Shell',
      'powershell': 'PowerShell',
      'json': 'JSON',
      'yaml': 'YAML',
      'yml': 'YAML',
      'xml': 'XML',
      'markdown': 'Markdown',
      'md': 'Markdown',
      'jsx': 'JSX',
      'tsx': 'TSX',
      'vue': 'Vue',
      'dart': 'Dart',
      'r': 'R',
      'perl': 'Perl',
      'lua': 'Lua',
      'haskell': 'Haskell',
      'erlang': 'Erlang',
      'elixir': 'Elixir',
      'clojure': 'Clojure',
      'assembly': 'Assembly',
      'asm': 'Assembly',
    };
    return languageMap[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1);
  };

  return (
    <div className="code-widget-backdrop" onClick={onClose}>
      <div className="code-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="code-widget-content">
          <div className="code-header">
            <span className="language-label">{getDisplayLanguage(language)}</span>
            <button className="copy-button" onClick={handleCopy} title="Copy code">
              {copied ? <FiCheck /> : <FiCopy />}
            </button>
          </div>
          <div className="code-container">
            <SyntaxHighlighter
              language={language.toLowerCase()}
              style={vscDarkPlus}
              showLineNumbers={false}
              wrapLines={true}
              customStyle={{
                margin: 0,
                padding: '20px',
                background: 'transparent',
                fontSize: '14px',
                lineHeight: '1.5',
              }}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>
    </div>
  );
};
