import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';

type MonacoEnvironmentShape = {
  getWorker: (_moduleId: string, label: string) => Worker;
};

const globalMonaco = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoEnvironmentShape;
};

let monacoEnvironmentConfigured = false;

export const configureMonacoEnvironment = () => {
  if (monacoEnvironmentConfigured) {
    return;
  }

  monacoEnvironmentConfigured = true;

  globalMonaco.MonacoEnvironment = {
    // The protocol parser page only needs JSON language services and lightweight
    // JavaScript tokenization/snippets, so we keep the worker graph minimal here.
    getWorker(_moduleId, label) {
      if (label === 'json') {
        return new jsonWorker();
      }

      return new editorWorker();
    },
  };
};

export { monaco };
