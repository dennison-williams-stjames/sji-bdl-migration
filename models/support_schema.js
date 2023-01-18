const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SupportSchema = new Schema({
  needSupport: String,
  name: String,
  contact: String,
  callingFrom: String
})

module.exports = SupportSchema;
