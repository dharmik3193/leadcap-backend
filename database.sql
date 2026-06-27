CREATE TABLE leads (

    id INT AUTO_INCREMENT PRIMARY KEY,

    lead_id VARCHAR(100) UNIQUE,

    page_id VARCHAR(100),

    form_id VARCHAR(100),

    full_name VARCHAR(255),

    phone VARCHAR(50),

    email VARCHAR(255),

    city VARCHAR(100),

    state VARCHAR(100),

    country VARCHAR(100),

    status ENUM(
        'New',
        'Contacted',
        'Qualified',
        'Lost',
        'Converted'
    ) DEFAULT 'New',

    notes TEXT,

    raw_data JSON,

    created_time DATETIME,

    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);