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

const LANGUAGE_MAP: Record<string, string> = {
  javascript: 'JS', js: 'JS', typescript: 'TS', ts: 'TS',
  python: 'PY', py: 'PY', java: 'JAVA', cpp: 'C++', c: 'C',
  csharp: 'C#', cs: 'C#', go: 'GO', rust: 'RS', ruby: 'RB',
  php: 'PHP', swift: 'SWIFT', kotlin: 'KT', html: 'HTML',
  css: 'CSS', scss: 'SCSS', sql: 'SQL', bash: 'SH', shell: 'SH',
  sh: 'SH', json: 'JSON', yaml: 'YAML', yml: 'YAML', xml: 'XML',
  markdown: 'MD', md: 'MD', jsx: 'JSX', tsx: 'TSX', txt: 'TXT',
};

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

  const label = LANGUAGE_MAP[language.toLowerCase()] ?? language.toUpperCase();

  return (
    <div className="code-widget-backdrop" onClick={onClose}>
      <div className="code-widget" onClick={(e) => e.stopPropagation()}>
        <div className="code-titlebar">
          <span className="code-language-label">{label}</span>
          <div className="code-titlebar-actions">
            <button className="code-copy-btn" onClick={handleCopy} title="Copy code">
              {copied ? <FiCheck /> : <FiCopy />}
            </button>
            <button className="code-close-btn" onClick={onClose} aria-label="Close" />
          </div>
        </div>
        <div className="code-body">
          <SyntaxHighlighter
            language={language.toLowerCase()}
            style={vscDarkPlus}
            showLineNumbers={false}
            wrapLines
            customStyle={{
              margin: 0,
              padding: '20px 24px',
              background: 'transparent',
              fontSize: '13px',
              lineHeight: '1.6',
            }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
};
