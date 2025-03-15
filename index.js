require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const RPC_PROVIDER_URL = process.env.RPC_PROVIDER_URL;
const RPC_PORT = process.env.RPC_PORT || 8545;
const RPC_HOST = process.env.RPC_HOST || 'localhost';
const MAX_BLOCK_RANGE = parseInt(process.env.MAX_BLOCK_RANGE || 10000);

// Function to check if the RPC call is a filter call and if it exceeds the MAX_BLOCK_RANGE
const isFilterExceedingRange = (payload) => {
  if (!payload.method || !payload.params) return false;
  
  // Check for eth_getLogs method
  if (payload.method === 'eth_getLogs' && payload.params.length > 0) {
    const filter = payload.params[0];
    if (filter.fromBlock && filter.toBlock) {
      const fromBlock = parseInt(filter.fromBlock, 16);
      const toBlock = parseInt(filter.toBlock, 16);
      
      return !isNaN(fromBlock) && !isNaN(toBlock) && (toBlock - fromBlock) > MAX_BLOCK_RANGE;
    }
  }
  
  return false;
};

// Function to split a filter call into multiple batches
const batchFilterCall = async (payload) => {
  const filter = payload.params[0];
  const fromBlock = parseInt(filter.fromBlock, 16);
  const toBlock = parseInt(filter.toBlock, 16);
  
  console.log(`Batching filter call from block ${fromBlock} to ${toBlock}`);
  
  let results = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCK_RANGE) {
    const end = Math.min(start + MAX_BLOCK_RANGE - 1, toBlock);
    
    const batchPayload = {
      ...payload,
      params: [{
        ...filter,
        fromBlock: '0x' + start.toString(16),
        toBlock: '0x' + end.toString(16)
      }]
    };
    
    try {
      const response = await axios.post(RPC_PROVIDER_URL, batchPayload);
      if (response.data.result) {
        results = results.concat(response.data.result);
      }
    } catch (error) {
      console.error('Error in RPC request:');
      console.error('Request:', JSON.stringify(batchPayload, null, 2));
      console.error('Response error:', error.response?.data || error.message);
      throw error;
    }
  }
  
  return {
    jsonrpc: payload.jsonrpc,
    id: payload.id,
    result: results
  };
};

// Main proxy endpoint
app.post('/', async (req, res) => {
  const payload = req.body;
  
  try {
    if (isFilterExceedingRange(payload)) {
      const batchedResult = await batchFilterCall(payload);
      return res.json(batchedResult);
    } else {
      try {
        const response = await axios.post(RPC_PROVIDER_URL, payload);
        return res.json(response.data);
      } catch (error) {
        console.error('Error in RPC request:');
        console.error('Request:', JSON.stringify(payload, null, 2));
        console.error('Response error:', error.response?.data || error.message);
        throw error;
      }
    }
  } catch (error) {
    return res.status(500).json({
      jsonrpc: payload.jsonrpc,
      id: payload.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    });
  }
});

// Handle array of RPC calls
app.post('/batch', async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({
      error: {
        code: -32600,
        message: 'Invalid Request',
        data: 'Expected array of RPC calls'
      }
    });
  }
  
  const results = [];
  for (const payload of req.body) {
    try {
      if (isFilterExceedingRange(payload)) {
        const batchedResult = await batchFilterCall(payload);
        results.push(batchedResult);
      } else {
        try {
          const response = await axios.post(RPC_PROVIDER_URL, payload);
          results.push(response.data);
        } catch (error) {
          console.error('Error in batch RPC request:');
          console.error('Request:', JSON.stringify(payload, null, 2));
          console.error('Response error:', error.response?.data || error.message);
          
          results.push({
            jsonrpc: payload.jsonrpc,
            id: payload.id,
            error: {
              code: -32603,
              message: 'Internal error',
              data: error.message
            }
          });
        }
      }
    } catch (error) {
      results.push({
        jsonrpc: payload.jsonrpc,
        id: payload.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      });
    }
  }
  
  return res.json(results);
});

app.listen(RPC_PORT, RPC_HOST, () => {
  console.log(`RPC Proxy running at http://${RPC_HOST}:${RPC_PORT}`);
  console.log(`Forwarding requests to: ${RPC_PROVIDER_URL}`);
  console.log(`Max block range for filter calls: ${MAX_BLOCK_RANGE}`);
});