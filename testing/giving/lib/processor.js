const fs = require('fs');
const path = require('path');

function loadProcessor(root, name) {
  const id = String(name || 'transfirst').toLowerCase();
  if (!/^[a-z0-9]+$/.test(id)) {
    const error = new Error('Pass --processor <name>, for example --processor transfirst');
    error.usage = true;
    throw error;
  }
  const file = path.join(root, 'processors', `${id}.json`);
  if (!fs.existsSync(file)) {
    const error = new Error(`No processor file processors/${id}.json`);
    error.usage = true;
    throw error;
  }
  const processor = JSON.parse(fs.readFileSync(file, 'utf8'));
  processor.id = processor.id || id;
  return processor;
}

function usageError(message) {
  const error = new Error(message);
  error.usage = true;
  return error;
}

function creditCard(processor, id) {
  const card = (processor.creditCards || []).find((entry) => entry.id === id);
  if (!card) throw usageError(`Processor ${processor.id} has no credit card "${id}"`);
  return card;
}

function bankAccount(processor, id) {
  const account = (processor.bankAccounts || []).find((entry) => entry.id === id);
  if (!account) throw usageError(`Processor ${processor.id} has no bank account "${id}"`);
  return account;
}

module.exports = { loadProcessor, creditCard, bankAccount };
