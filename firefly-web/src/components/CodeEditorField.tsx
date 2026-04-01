import React from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { configureMonacoEnvironment, monaco } from './monacoRuntime';

configureMonacoEnvironment();
loader.config({ monaco });

type EditorLanguage = 'json' | 'javascript';

type EditorSuggestion = Omit<monaco.languages.CompletionItem, 'range'>;

interface CodeEditorFieldProps {
  language: EditorLanguage;
  path: string;
  value?: string;
  onChange?: (value: string) => void;
  height?: number | string;
  readOnly?: boolean;
  readOnlyLabel?: string;
}

let monacoInitialized = false;

const MATCH_RULE_PROPERTIES = {
  topicPrefix: {
    type: 'string',
    description: 'Match topics with a common prefix.',
  },
  topicEquals: {
    type: 'string',
    description: 'Match an exact topic.',
  },
  messageTypeEquals: {
    type: 'string',
    description: 'Match a concrete message type such as PROPERTY_REPORT.',
  },
  deviceNameEquals: {
    type: 'string',
    description: 'Match a specific device name.',
  },
  productKeyEquals: {
    type: 'string',
    description: 'Match a business product key instead of a database identifier.',
  },
  headerEquals: {
    type: 'object',
    description: 'Match request headers by exact key/value pairs.',
  },
  remoteAddressPrefix: {
    type: 'string',
    description: 'Match source addresses with a common prefix.',
  },
} satisfies Record<string, unknown>;

const JSON_SCHEMAS = [
  {
    uri: 'firefly://protocol-parser/match-rule.schema.json',
    fileMatch: ['*matchRule.json'],
    schema: {
      type: 'object',
      properties: MATCH_RULE_PROPERTIES,
      additionalProperties: true,
    },
  },
  {
    uri: 'firefly://protocol-parser/frame-config.schema.json',
    fileMatch: ['*frameConfig.json'],
    schema: {
      type: 'object',
      properties: {
        delimiterHex: { type: 'string', description: 'Hex delimiter, for example 0A.' },
        stripDelimiter: { type: 'boolean', description: 'Drop delimiter bytes from the decoded frame.' },
        fixedLength: { type: 'number', description: 'Fixed frame length in bytes.' },
        lengthFieldOffset: { type: 'number', description: 'Offset of the length field.' },
        lengthFieldLength: { type: 'number', description: 'Length of the length field.' },
        lengthAdjustment: { type: 'number', description: 'Adjustment applied to the decoded frame length.' },
        maxBufferedBytes: { type: 'number', description: 'Upper bound for session remainder buffering.' },
      },
      additionalProperties: true,
    },
  },
  {
    uri: 'firefly://protocol-parser/parser-config.schema.json',
    fileMatch: ['*parserConfig.json'],
    schema: {
      type: 'object',
      properties: {
        defaultTopic: { type: 'string', description: 'Default topic used by the parser or encoder.' },
        messageType: { type: 'string', description: 'Normalized message type.' },
        payloadField: { type: 'string', description: 'JSON field that holds business payload.' },
        deviceNameField: { type: 'string', description: 'JSON field used to extract deviceName.' },
        timestampField: { type: 'string', description: 'JSON field used to extract timestamp.' },
        payloadEncoding: { type: 'string', description: 'Expected payload encoding such as JSON or HEX.' },
        pairSeparator: { type: 'string', description: 'Separator for text key/value pairs.' },
        kvSeparator: { type: 'string', description: 'Separator between key and value.' },
        tenantCode: { type: 'string', description: 'Tenant business code, auto-injected by the page.' },
        productKey: { type: 'string', description: 'Product business key, auto-injected for product scope.' },
      },
      additionalProperties: true,
    },
  },
  {
    uri: 'firefly://protocol-parser/visual-config.schema.json',
    fileMatch: ['*visualConfig.json'],
    schema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Visual template key.' },
        topic: { type: 'string', description: 'Default topic used by the visual flow.' },
        payloadField: { type: 'string', description: 'Payload field used by the generated script.' },
        deviceNameField: { type: 'string', description: 'Device field used by the generated script.' },
        timestampField: { type: 'string', description: 'Timestamp field used by the generated script.' },
        messageType: { type: 'string', description: 'Generated message type.' },
        payloadEncoding: { type: 'string', description: 'Downlink payload encoding.' },
      },
      additionalProperties: true,
    },
  },
  {
    uri: 'firefly://protocol-parser/release-config.schema.json',
    fileMatch: ['*releaseConfig.json'],
    schema: {
      type: 'object',
      properties: {
        percent: { type: 'number', description: 'Percentage for HASH_PERCENT mode.' },
        deviceNames: {
          type: 'array',
          description: 'Preferred business identifiers for DEVICE_LIST mode.',
          items: { type: 'string' },
        },
      },
      additionalProperties: true,
    },
  },
];

const JSON_SUGGESTIONS_BY_PATH: Record<string, EditorSuggestion[]> = {
  'matchRule.json': [
    {
      label: 'topicPrefix',
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: '"topicPrefix": "$1"',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Match messages by topic prefix.',
    },
    {
      label: 'headerEquals',
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: '"headerEquals": {\n\t"$1": "$2"\n}',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Match request headers with exact values.',
    },
  ],
  'frameConfig.json': [
    {
      label: 'delimiterHex',
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: '"delimiterHex": "$1"',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Hex delimiter used by DELIMITER mode.',
    },
    {
      label: 'fixedLength',
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: '"fixedLength": ${1:32}',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Frame length in bytes for FIXED_LENGTH mode.',
    },
  ],
  'parserConfig.json': [
    {
      label: 'defaultTopic',
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: '"defaultTopic": "$1"',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Default topic used by parser or encoder.',
    },
    {
      label: 'tenantCode',
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: '"tenantCode": "$1"',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Usually auto-injected by the page.',
    },
  ],
  'visualConfig.json': [
    {
      label: 'template',
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: '"template": "$1"',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Visual template key used by the generated script.',
    },
  ],
  'releaseConfig.json': [
    {
      label: 'deviceNames',
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: '"deviceNames": [\n\t"$1"\n]',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Preferred device list for DEVICE_LIST mode.',
    },
    {
      label: 'percent',
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: '"percent": ${1:10}',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: 'Percentage for HASH_PERCENT mode.',
    },
  ],
};

const JAVASCRIPT_SNIPPETS: EditorSuggestion[] = [
  {
    label: 'parse(ctx)',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'function parse(ctx) {',
      '\tconst config = ctx.config || {};',
      '\treturn {',
      '\t\tmessages: [',
      '\t\t\t{',
      '\t\t\t\ttype: config.messageType || "PROPERTY_REPORT",',
      '\t\t\t\ttopic: ctx.topic || config.defaultTopic || "$1",',
      '\t\t\t\tpayload: {},',
      '\t\t\t\ttimestamp: Date.now()',
      '\t\t\t}',
      '\t\t]',
      '\t};',
      '}',
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Basic uplink parser snippet.',
  },
  {
    label: 'encode(ctx)',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'function encode(ctx) {',
      '\tconst config = ctx.config || {};',
      '\treturn {',
      '\t\ttopic: ctx.topic || config.defaultTopic || "$1",',
      '\t\tpayloadText: JSON.stringify(ctx.payload || {}),',
      '\t\tpayloadEncoding: config.payloadEncoding || "JSON",',
      '\t\theaders: config.headers || {}',
      '\t};',
      '}',
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Basic downlink encoder snippet.',
  },
  {
    label: 'ctx.config',
    kind: monaco.languages.CompletionItemKind.Property,
    insertText: 'ctx.config',
    documentation: 'Runtime parser configuration JSON.',
  },
  {
    label: 'ctx.payloadText',
    kind: monaco.languages.CompletionItemKind.Property,
    insertText: 'ctx.payloadText',
    documentation: 'Decoded payload text from the connector runtime.',
  },
  {
    label: 'ctx.topic',
    kind: monaco.languages.CompletionItemKind.Property,
    insertText: 'ctx.topic',
    documentation: 'Current uplink or downlink topic.',
  },
];

const buildRange = (model: monaco.editor.ITextModel, position: monaco.Position) => {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
};

const currentModelKey = (model: monaco.editor.ITextModel) => {
  const path = model.uri.path || '';
  return path.slice(path.lastIndexOf('/') + 1);
};

const ensureMonacoSetup = (instance: typeof monaco) => {
  if (monacoInitialized) {
    return;
  }

  monacoInitialized = true;
  configureMonacoEnvironment();

  instance.editor.defineTheme('firefly-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#ffffff',
      'editor.lineHighlightBackground': '#f8fafc',
      'editorLineNumber.foreground': '#94a3b8',
      'editor.selectionBackground': '#dbeafe',
    },
  });

  instance.editor.defineTheme('firefly-readonly', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#f8fafc',
      'editorGutter.background': '#f8fafc',
      'editor.lineHighlightBackground': '#f8fafc',
      'editorLineNumber.foreground': '#94a3b8',
      'editor.selectionBackground': '#dbeafe',
      'editorCursor.foreground': '#94a3b8',
    },
  });

  const jsonApi = (instance.languages as typeof instance.languages & {
    json?: { jsonDefaults?: { setDiagnosticsOptions: (options: Record<string, unknown>) => void } };
  }).json;
  jsonApi?.jsonDefaults?.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    schemas: JSON_SCHEMAS,
  });

  // Attach lightweight business-aware completions so JSON and scripts are not just plain text.
  instance.languages.registerCompletionItemProvider('json', {
    provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position) {
      const suggestions = JSON_SUGGESTIONS_BY_PATH[currentModelKey(model)] || [];
      return {
        suggestions: suggestions.map((item) => ({
          ...item,
          range: buildRange(model, position),
        })),
      };
    },
  });

  instance.languages.registerCompletionItemProvider('javascript', {
    provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position) {
      return {
        suggestions: JAVASCRIPT_SNIPPETS.map((item) => ({
          ...item,
          range: buildRange(model, position),
        })),
      };
    },
  });
};

const CodeEditorField: React.FC<CodeEditorFieldProps> = ({
  language,
  path,
  value,
  onChange,
  height = 240,
  readOnly = false,
  readOnlyLabel,
}) => (
  <div
    style={{
      position: 'relative',
      border: readOnly ? '1px solid #cbd5e1' : '1px solid #d9d9d9',
      borderRadius: 12,
      overflow: 'hidden',
      background: readOnly ? '#f8fafc' : '#ffffff',
      boxShadow: readOnly ? 'inset 0 1px 0 rgba(255,255,255,0.9)' : 'none',
    }}
  >
    {readOnlyLabel ? (
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1,
          padding: '2px 10px',
          borderRadius: 999,
          background: 'rgba(148,163,184,0.16)',
          color: '#475569',
          fontSize: 12,
          fontWeight: 600,
          pointerEvents: 'none',
        }}
      >
        {readOnlyLabel}
      </div>
    ) : null}
    <Editor
      path={path}
      language={language}
      value={value}
      onMount={() => ensureMonacoSetup(monaco)}
      beforeMount={ensureMonacoSetup}
      onChange={(nextValue) => onChange?.(nextValue ?? '')}
      theme={readOnly ? 'firefly-readonly' : 'firefly-light'}
      height={height}
      options={{
        automaticLayout: true,
        readOnly,
        domReadOnly: readOnly,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        quickSuggestions: readOnly ? false : { other: true, strings: true, comments: false },
        suggestOnTriggerCharacters: !readOnly,
        formatOnPaste: !readOnly,
        formatOnType: !readOnly && language === 'json',
        tabSize: 2,
        padding: { top: 12, bottom: 12 },
        lineNumbersMinChars: 3,
        glyphMargin: false,
        folding: true,
        wordBasedSuggestions: 'currentDocument',
        renderLineHighlight: readOnly ? 'none' : 'line',
        occurrencesHighlight: readOnly ? 'off' : 'singleFile',
        cursorStyle: readOnly ? 'line-thin' : 'line',
      }}
    />
  </div>
);

export default CodeEditorField;
