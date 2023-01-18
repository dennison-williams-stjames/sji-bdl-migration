const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PerpSchema = new Schema({
	name: {
		type: String,
		required: true
	},
	phone: String,
	email: String,
	perpType: {
		type: String,
		required: true
	},
	adServiceUsed: String,
	gender: {
		type: String,
		required: true,
	},
	age: {
		type: String,
		required: true
	},
	race: {
		type: String,
		required: true
	},
	height: {
		type: String,
		required: true
	},
	hair: {
		type: String,
		required: true
	},
	attributes: String,
	vehicle: String
});

module.exports = PerpSchema;
