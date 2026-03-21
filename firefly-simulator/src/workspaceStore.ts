import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { simulatorStateStorage } from './storage';

export interface SimulatorEnvironment {
  id: string;
  name: string;
  gatewayBaseUrl: string;
  protocolBaseUrl: string;
  mediaBaseUrl: string;
  mqttBrokerUrl: string;
}

export interface SimulatorLoginUser {
  id: number;
  username: string;
  realName: string | null;
  tenantId: string;
  tenantName: string;
  userType: string;
}

export interface SimulatorLoginSession {
  accessToken: string;
  refreshToken: string | null;
  user: SimulatorLoginUser;
  loginAt: string;
}

interface SimulatorWorkspaceState {
  environments: SimulatorEnvironment[];
  activeEnvironmentId: string;
  sessions: Record<string, SimulatorLoginSession | undefined>;

  addEnvironment: (environment: Omit<SimulatorEnvironment, 'id'>) => string;
  updateEnvironment: (id: string, patch: Partial<Omit<SimulatorEnvironment, 'id'>>) => void;
  removeEnvironment: (id: string) => void;
  setActiveEnvironment: (id: string) => void;
  saveSession: (environmentId: string, session: SimulatorLoginSession) => void;
  clearSession: (environmentId: string) => void;
}

const DEFAULT_ENVIRONMENT: SimulatorEnvironment = {
  id: 'local-default',
  name: '本地开发',
  gatewayBaseUrl: 'http://localhost:8080',
  protocolBaseUrl: 'http://localhost:9070',
  mediaBaseUrl: 'http://localhost:9040',
  mqttBrokerUrl: 'mqtt://localhost:1883',
};

function trimText(value?: string | null): string {
  return (value || '').trim();
}

function trimHttpBaseUrl(value?: string | null): string {
  return trimText(value).replace(/\/+$/, '');
}

function normalizeEnvironmentPatch(
  patch: Partial<Omit<SimulatorEnvironment, 'id'>>,
): Partial<Omit<SimulatorEnvironment, 'id'>> {
  const nextPatch: Partial<Omit<SimulatorEnvironment, 'id'>> = {};
  if (patch.name !== undefined) {
    nextPatch.name = trimText(patch.name);
  }
  if (patch.gatewayBaseUrl !== undefined) {
    nextPatch.gatewayBaseUrl = trimHttpBaseUrl(patch.gatewayBaseUrl);
  }
  if (patch.protocolBaseUrl !== undefined) {
    nextPatch.protocolBaseUrl = trimHttpBaseUrl(patch.protocolBaseUrl);
  }
  if (patch.mediaBaseUrl !== undefined) {
    nextPatch.mediaBaseUrl = trimHttpBaseUrl(patch.mediaBaseUrl);
  }
  if (patch.mqttBrokerUrl !== undefined) {
    nextPatch.mqttBrokerUrl = trimText(patch.mqttBrokerUrl);
  }
  return nextPatch;
}

function buildDefaultSimulatorEnvironment(
  environment?: Partial<Omit<SimulatorEnvironment, 'id'>>,
): Omit<SimulatorEnvironment, 'id'> {
  const normalized = normalizeEnvironmentPatch(environment || {});
  return {
    name: normalized.name || DEFAULT_ENVIRONMENT.name,
    gatewayBaseUrl: normalized.gatewayBaseUrl || DEFAULT_ENVIRONMENT.gatewayBaseUrl,
    protocolBaseUrl: normalized.protocolBaseUrl || DEFAULT_ENVIRONMENT.protocolBaseUrl,
    mediaBaseUrl: normalized.mediaBaseUrl || DEFAULT_ENVIRONMENT.mediaBaseUrl,
    mqttBrokerUrl: normalized.mqttBrokerUrl || DEFAULT_ENVIRONMENT.mqttBrokerUrl,
  };
}

function buildWsEndpoint(protocolBaseUrl: string): string {
  const normalizedBaseUrl = trimHttpBaseUrl(protocolBaseUrl) || DEFAULT_ENVIRONMENT.protocolBaseUrl;
  try {
    const target = new URL(normalizedBaseUrl);
    target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
    target.pathname = `${target.pathname.replace(/\/+$/, '')}/ws/device`;
    target.search = '';
    target.hash = '';
    return target.toString();
  } catch {
    return 'ws://localhost:9070/ws/device';
  }
}

function buildLoraWebhookUrl(protocolBaseUrl: string): string {
  const normalizedBaseUrl = trimHttpBaseUrl(protocolBaseUrl) || DEFAULT_ENVIRONMENT.protocolBaseUrl;
  return `${normalizedBaseUrl}/api/v1/lorawan/webhook/up`;
}

export function buildEnvironmentDeviceDefaults(environment?: SimulatorEnvironment | null) {
  const activeEnvironment = environment || DEFAULT_ENVIRONMENT;
  const protocolBaseUrl = trimHttpBaseUrl(activeEnvironment.protocolBaseUrl) || DEFAULT_ENVIRONMENT.protocolBaseUrl;
  const gatewayBaseUrl = trimHttpBaseUrl(activeEnvironment.gatewayBaseUrl) || DEFAULT_ENVIRONMENT.gatewayBaseUrl;
  const mediaBaseUrl = trimHttpBaseUrl(activeEnvironment.mediaBaseUrl) || DEFAULT_ENVIRONMENT.mediaBaseUrl;
  const mqttBrokerUrl = trimText(activeEnvironment.mqttBrokerUrl) || DEFAULT_ENVIRONMENT.mqttBrokerUrl;

  return {
    httpBaseUrl: protocolBaseUrl,
    httpRegisterBaseUrl: protocolBaseUrl,
    coapBaseUrl: protocolBaseUrl,
    mqttRegisterBaseUrl: protocolBaseUrl,
    mqttBrokerUrl,
    mediaBaseUrl,
    snmpConnectorUrl: protocolBaseUrl,
    modbusConnectorUrl: protocolBaseUrl,
    wsConnectorUrl: protocolBaseUrl,
    wsEndpoint: buildWsEndpoint(protocolBaseUrl),
    openApiBaseUrl: gatewayBaseUrl,
    loraWebhookUrl: buildLoraWebhookUrl(protocolBaseUrl),
  };
}

export function getActiveEnvironment(
  environments: SimulatorEnvironment[],
  activeEnvironmentId: string,
): SimulatorEnvironment {
  return environments.find((item) => item.id === activeEnvironmentId) || environments[0] || DEFAULT_ENVIRONMENT;
}

export function isSimulatorAuthInvalid(result: any): boolean {
  const status = Number(result?._status || 0);
  const code = Number(result?.code || 0);
  return status === 401 || code === 1002 || code === 2004 || code === 2005 || code === 2006;
}

export const useSimWorkspaceStore = create<SimulatorWorkspaceState>()(
  persist(
    (set, get) => ({
      environments: [DEFAULT_ENVIRONMENT],
      activeEnvironmentId: DEFAULT_ENVIRONMENT.id,
      sessions: {},

      addEnvironment: (environment) => {
        const id = uuidv4();
        const nextEnvironment: SimulatorEnvironment = {
          id,
          ...buildDefaultSimulatorEnvironment(environment),
        };
        set((state) => ({
          environments: [...state.environments, nextEnvironment],
          activeEnvironmentId: id,
        }));
        return id;
      },

      updateEnvironment: (id, patch) => {
        const normalizedPatch = normalizeEnvironmentPatch(patch);
        set((state) => ({
          environments: state.environments.map((item) => (
            item.id === id
              ? {
                  ...item,
                  ...normalizedPatch,
                }
              : item
          )),
        }));
      },

      removeEnvironment: (id) => {
        const state = get();
        if (state.environments.length <= 1) {
          return;
        }

        const nextEnvironments = state.environments.filter((item) => item.id !== id);
        const nextSessions = { ...state.sessions };
        delete nextSessions[id];
        const nextActiveEnvironmentId = state.activeEnvironmentId === id
          ? nextEnvironments[0]?.id || DEFAULT_ENVIRONMENT.id
          : state.activeEnvironmentId;

        set({
          environments: nextEnvironments,
          activeEnvironmentId: nextActiveEnvironmentId,
          sessions: nextSessions,
        });
      },

      setActiveEnvironment: (id) => {
        const target = get().environments.find((item) => item.id === id);
        if (!target) {
          return;
        }
        set({ activeEnvironmentId: id });
      },

      saveSession: (environmentId, session) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [environmentId]: session,
          },
        }));
      },

      clearSession: (environmentId) => {
        set((state) => {
          const nextSessions = { ...state.sessions };
          delete nextSessions[environmentId];
          return { sessions: nextSessions };
        });
      },
    }),
    {
      name: 'firefly-sim-workspace-store',
      storage: createJSONStorage(() => simulatorStateStorage),
      partialize: (state) => ({
        environments: state.environments.map((environment) => ({
          ...environment,
          ...buildDefaultSimulatorEnvironment(environment),
        })),
        activeEnvironmentId: state.activeEnvironmentId,
        sessions: state.sessions,
      }),
      merge: (persistedState, currentState) => {
        const incoming = (persistedState || {}) as Partial<SimulatorWorkspaceState>;
        const persistedEnvironments = Array.isArray(incoming.environments) && incoming.environments.length > 0
          ? incoming.environments.map((environment) => ({
              ...environment,
              ...buildDefaultSimulatorEnvironment(environment),
            }))
          : currentState.environments;
        const activeEnvironmentId = persistedEnvironments.some((item) => item.id === incoming.activeEnvironmentId)
          ? (incoming.activeEnvironmentId as string)
          : persistedEnvironments[0]?.id || DEFAULT_ENVIRONMENT.id;
        return {
          ...currentState,
          ...incoming,
          environments: persistedEnvironments,
          activeEnvironmentId,
          sessions: incoming.sessions || currentState.sessions,
        };
      },
    },
  ),
);
