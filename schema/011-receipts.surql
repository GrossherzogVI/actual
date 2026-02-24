-- Receipt OCR table
DEFINE TABLE receipt SCHEMAFULL;
DEFINE FIELD image_data ON receipt TYPE string;
DEFINE FIELD file_name ON receipt TYPE string;
DEFINE FIELD file_type ON receipt TYPE string;
DEFINE FIELD status ON receipt TYPE string DEFAULT 'pending';
DEFINE FIELD extracted_amount ON receipt TYPE option<float>;
DEFINE FIELD extracted_date ON receipt TYPE option<string>;
DEFINE FIELD extracted_vendor ON receipt TYPE option<string>;
DEFINE FIELD extracted_items ON receipt TYPE option<array>;
DEFINE FIELD transaction_link ON receipt TYPE option<record<transaction>>;
DEFINE FIELD confidence ON receipt TYPE option<float>;
DEFINE FIELD raw_ocr_response ON receipt TYPE option<string>;
DEFINE FIELD created_at ON receipt TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON receipt TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_receipt_status ON receipt FIELDS status;
