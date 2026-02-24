export type ReceiptStatus = 'pending' | 'processing' | 'processed' | 'matched' | 'failed';

export type ReceiptItem = {
  name: string;
  amount: number;
  quantity?: number;
};

export type Receipt = {
  id: string;
  image_data: string;
  file_name: string;
  file_type: string;
  status: ReceiptStatus;
  extracted_amount?: number;
  extracted_date?: string;
  extracted_vendor?: string;
  extracted_items?: ReceiptItem[];
  transaction_link?: string;
  confidence?: number;
  raw_ocr_response?: string;
  created_at: string;
  updated_at: string;
};

export type MatchCandidate = {
  id: string;
  date: string;
  amount: number;
  payee_name?: string;
  notes?: string;
};
