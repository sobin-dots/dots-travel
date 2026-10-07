export interface AccountVerificationResult {
  valid: boolean;
  authId?: string;
  authIdLast4?: string;
  accountName?: string;
  cashCredits?: string;
  error?: string;
}

export interface SearchNumbersParams {
  countryIso: string;
  type?: 'local' | 'tollfree' | 'mobile';
  prefix?: string;
  region?: string;
  city?: string;
  limit?: number;
  offset?: number;
}

export interface AvailableNumberDTO {
  number: string;
  countryIso: string;
  type: string;
  region?: string;
  city?: string;
  monthlyRental?: string;
  smsRate?: string;
  voiceRate?: string;
}

export interface BuyNumberParams {
  number: string;
  appId?: string;
  cnam?: 'enabled' | 'disabled';
  complianceApplicationId?: string;
}

export interface PurchasedNumberDTO {
  number: string;
  status: string;
  message: string;
}

export interface ListOwnedNumbersParams {
  limit?: number;
  offset?: number;
}

export interface OwnedNumberDTO {
  number: string;
  alias?: string;
  appId?: string;
  monthlyRental?: string;
  voiceRate?: string;
  smsRate?: string;
}

export interface UpdateNumberParams {
  appId?: string;
  alias?: string;
}

export interface CreateCallParams {
  from: string;
  to: string;
  answerUrl: string;
  ringUrl?: string;
  hangupUrl?: string;
  fallbackUrl?: string;
  timeLimit?: number;
  machineDetection?: boolean;
  sipHeaders?: Record<string, string>;
}

export interface CallResultDTO {
  callUuid: string;
  requestUuid?: string;
  apiId: string;
  message: string;
}

export interface CallDetailDTO {
  callUuid: string;
  from: string;
  to: string;
  status: string;
  duration?: number;
  billDuration?: number;
  totalCost?: string;
  hangupCause?: number;
}

export interface SendMessageParams {
  src?: string;
  powerpackUuid?: string;
  dst: string | string[];
  text: string;
  type?: 'sms' | 'mms' | 'whatsapp';
  url?: string;
  mediaUrls?: string[];
}

export interface MessageResultDTO {
  messageUuids: string[];
  apiId: string;
  message: string;
}

export interface MessageDetailDTO {
  messageUuid: string;
  from: string;
  to: string;
  status: string;
  units?: number;
  totalRate?: string;
  totalAmount?: string;
  errorCode?: string;
}

export interface RecordingDTO {
  recordingId: string;
  recordingUrl: string;
  durationSeconds?: number;
  callUuid?: string;
}

export interface TranscriptionOptions {
  transcriptionType?: 'auto' | 'hybrid' | 'manual';
  transcriptionUrl?: string;
}

export interface TranscriptionResultDTO {
  transcriptionId: string;
  recordingId: string;
  status: string;
  message: string;
}

export interface TelephonyProvider {
  readonly mode: 'simulator' | 'live';

  verifyCredentials(authId: string, authToken: string): Promise<AccountVerificationResult>;
  searchNumbers(params: SearchNumbersParams): Promise<AvailableNumberDTO[]>;
  buyNumber(params: BuyNumberParams): Promise<PurchasedNumberDTO>;
  listOwnedNumbers(params?: ListOwnedNumbersParams): Promise<OwnedNumberDTO[]>;
  updateNumber(number: string, params: UpdateNumberParams): Promise<void>;
  releaseNumber(number: string): Promise<void>;

  createCall(params: CreateCallParams): Promise<CallResultDTO>;
  getCall(callUuid: string): Promise<CallDetailDTO>;
  hangupCall(callUuid: string): Promise<void>;
  sendDigits(callUuid: string, digits: string, leg?: 'aleg' | 'bleg'): Promise<void>;
  playAudio(callUuid: string, url: string): Promise<void>;
  speakText(callUuid: string, text: string): Promise<void>;
  startCallRecording(callUuid: string, options?: { timeLimit?: number; transcriptionType?: string }): Promise<{ recordingId: string }>;
  stopCallRecording(callUuid: string): Promise<void>;

  sendMessage(params: SendMessageParams): Promise<MessageResultDTO>;
  getMessage(messageUuid: string): Promise<MessageDetailDTO>;
  uploadMedia(files: { filename: string; buffer: Buffer; contentType: string }[]): Promise<string[]>;

  listRecordings(params?: { callUuid?: string; limit?: number }): Promise<RecordingDTO[]>;
  deleteRecording(recordingId: string): Promise<void>;
  createTranscription(recordingId: string, options?: TranscriptionOptions): Promise<TranscriptionResultDTO>;
  deleteTranscription(transcriptionId: string): Promise<void>;
}
