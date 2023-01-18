const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EditedReportSchema = new Schema({
	title: {
		type: String,
		required: true
	},
	content: {
		type: String,
		required: true
	}
});

module.exports = EditedReportSchema;
