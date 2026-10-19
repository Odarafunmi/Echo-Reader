// Boundary between Voice Studio and a voice-cloning TTS service (for example ElevenLabs).
// Sampling and verification work without it. Creating the cloned voice and narrating with it
// need a provider account, an API key, and a server route that keeps the key private.

export interface ClonedVoice {
  providerVoiceId: string;
}

export interface VoiceProvider {
  readonly name: string;
  /** Uploads the approved samples and returns the provider's voice id. */
  createVoice(samples: Blob[], displayName: string): Promise<ClonedVoice>;
  /** Narrates text in the cloned voice. */
  synthesize(text: string, voice: ClonedVoice): Promise<Blob>;
}

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super('No voice provider is connected yet. Your samples are saved and will be used once it is.');
    this.name = 'ProviderNotConfiguredError';
  }
}

/** Placeholder until a provider is connected. It fails loudly rather than pretending to clone. */
export const unconfiguredProvider: VoiceProvider = {
  name: 'none',
  async createVoice() {
    throw new ProviderNotConfiguredError();
  },
  async synthesize() {
    throw new ProviderNotConfiguredError();
  },
};
