const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Enable CORS for all origins (simplifies extension development)
app.use(cors());
app.use(bodyParser.json());

app.post('/fill_field', (req, res) => {
  const { field, block_snapshot } = req.body;
  
  console.log('Received request:', JSON.stringify(req.body, null, 2));

  if (!field) {
    return res.status(400).json({ status: 'fail', reason: 'Missing field descriptor' });
  }

  const labelLower = (field.label || '').toLowerCase();

  // Deterministic logic based on label
  if (labelLower.includes('first name')) {
    return res.json({ status: 'success', value: 'Yifan', reason: null });
  }
  
  if (labelLower.includes('last name')) {
    return res.json({ status: 'success', value: 'Mei', reason: null });
  }

  // Random logic for other fields
  const random = Math.random();
  if (random < 0.7) {
    return res.json({ status: 'success', value: 'Demo Value', reason: null });
  } else {
    return res.json({ status: 'fail', value: null, reason: 'no_demo_mapping' });
  }
});

app.listen(PORT, () => {
  console.log(`Stub API server running at http://localhost:${PORT}`);
});
