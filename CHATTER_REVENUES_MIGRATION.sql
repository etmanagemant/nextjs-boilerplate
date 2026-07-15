-- ============================================================================
-- CHATTER_REVENUES TABLE MIGRATION
-- ============================================================================
-- Adds transaction_id column and UNIQUE constraint for deduplication

-- ============================================================================
-- SCHRITT 1: ADD transaction_id column
-- ============================================================================
ALTER TABLE chatter_revenues
ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);

-- ============================================================================
-- SCHRITT 2: CREATE UNIQUE INDEX for deduplication
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_chatter_revenues_transaction_id 
ON chatter_revenues(transaction_id) 
WHERE transaction_id IS NOT NULL;

-- ============================================================================
-- SCHRITT 3: ADD transaction_type column (optional, for tracking tip vs ppv_unlock)
-- ============================================================================
ALTER TABLE chatter_revenues
ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50);

-- ============================================================================
-- SCHRITT 4: ADD chatter_found column (boolean flag: was chatter identified?)
-- ============================================================================
ALTER TABLE chatter_revenues
ADD COLUMN IF NOT EXISTS chatter_found BOOLEAN DEFAULT false;

-- ============================================================================
-- VERIFICATION: Check if columns exist
-- ============================================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'chatter_revenues'
ORDER BY ordinal_position;
