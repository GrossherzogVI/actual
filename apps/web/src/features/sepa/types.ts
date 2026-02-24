export type SepaPayment = {
  id: string;
  contract?: string; // record link
  payee_name: string;
  iban: string;
  bic: string;
  amount: number;
  reference: string; // Verwendungszweck
  execution_date: string; // ISO date
  status: 'draft' | 'exported' | 'confirmed';
  batch_id?: string;
  created_at: string;
};

export type SepaBatch = {
  id: string;
  name: string;
  total_amount: number;
  payment_count: number;
  xml_data?: string;
  status: 'draft' | 'exported' | 'confirmed';
  created_at: string;
};

export type PayerInfo = {
  name: string;
  iban: string;
  bic: string;
};

export type SepaPaymentDraft = Omit<SepaPayment, 'id' | 'created_at' | 'batch_id'>;
