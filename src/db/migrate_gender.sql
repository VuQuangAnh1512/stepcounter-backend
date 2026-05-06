-- Normalize existing gender values to 'Male' / 'Female'
UPDATE users SET gender = 'Male'   WHERE LOWER(gender) = 'male'   AND gender != 'Male';
UPDATE users SET gender = 'Female' WHERE LOWER(gender) = 'female' AND gender != 'Female';
