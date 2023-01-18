const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const PointSchema = require('./point_schema');
const PerpSchema = require('./perp_schema');
const EditedReportSchema = require('./edited_report_schema');
const SupportSchema = require('./support_schema');

const ReportSchema = new Schema({
	city: {
		type: String,
		required: true
	},
	locationType: {
		type: String,
		required: true
	},
	geolocation: PointSchema,
	gender: {
    type: String,
    required: true
  },
	date: {
    type: Date,
    required: true
  },
	assaultType: [String],
	assaultDescription: {
    type: String,
    required: true
  },
	perpetrator: PerpSchema,
  edited: {
    type: Boolean,
    default: false
  },
  editedReport: EditedReportSchema,
  support: SupportSchema
});

ReportSchema.index({ 'editedReport.content': 'text', 'editedReport.title': 'text' });

const Report = mongoose.model('report', ReportSchema);

// mongoose.set('debug', true);

module.exports = Report;
