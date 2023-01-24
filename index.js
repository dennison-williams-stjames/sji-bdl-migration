const fs = require('fs').promises;
const path = require('path');
const process = require('process');
require('dotenv').config();

// Google is used to interact with the Google BDL
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// Axios is used to interact with the SJI BDL API
const axios = require('axios');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// TODO: rewrite the authentication to use values from a .env file

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function getGoogleBDLResponses(auth) {
  const sheets = google.sheets({version: 'v4', auth});
  const res = await sheets.spreadsheets.values.get({
    // SJI BDL Results sheet: 1TLQJW0WDX2CqZIpwRHr84o1_4M_weOyMpOI8BzRG7CE
    spreadsheetId: '1TLQJW0WDX2CqZIpwRHr84o1_4M_weOyMpOI8BzRG7CE',
    // According to this: https://stackoverflow.com/a/39641586
    // one just specifies a long enough value and the algo only copies 
    // what is there.  Not specifying the sheet name defaults to the 
    // first visible
    range: 'A1:AD10000',
    ranges: [],
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return;
  }
  return rows;
}

async function getNodeBDLResponses() {
  if (!process.env.API_SERVER) {
     console.warn('process.env.API_SERVER is not set using default: localhost');
  }
  const server = process.env.API_SERVER || 'localhost';

  if (!process.env.API_USER) {
     console.warn('process.env.API_USER is not set using default: sji-bdl');
  }
  const user = process.env.API_USER || 'sji-bdl';

  if (!process.env.API_PASSWORD) {
     console.warn('process.env.API_PASSWORD is not set using default: sji-bdl');
  }
  const pass = process.env.API_PASSWORD || 'sji-bdl';

  auth = '';
  prefix = "http://";

  // TODO: Log into the BDL API: /api/admins/login
  // This will not use https in development
  if ( process.env.NODE_ENV == 'production' ) {
    prefix = 'https://';
  } else {
    console.warn('process.env.NODE_ENV not set using default: development');
  }

  console.debug(prefix + server +'/api/admins/login {email: '+ user +'}');
  return axios.post(prefix + server +'/api/admins/login', { email: user, password: pass })
    .then((response) => {
      auth = response.headers['x-auth'];
      console.debug('x-auth: '+ auth);
      console.debug(prefix + server +'/api/admins/reports');
      const config = {
        headers: { 'x-auth': auth }
      };
      axios.get(prefix + server + '/api/admins/reports', config)
        //.then((response) => response.data.json())
	.then((json) => {
	  //console.log(json.data);
	  json.data.forEach(function(val, i) {
	    console.log(i +': ');
	    console.log(val);
	    exit;
	    //console.log(val.assaultType);
	  });
        })
	.catch((error) => {
          console.log('There was an error fetching the reports: ', error);
        });
    })
    .catch((error) => {
      console.error(error);
      return;
    })
    .finally(function () {
      console.debug('login finished');
    });
}

// Documentation of the Google BDL columns
/*
  0 A: 'Timestamp' - this is our response id, convert it to seconds since epoch
  1 B: 'When did the incident happen?',
  2 C: 'What city did the incident with the Bad Date take place?',
  3 D: 'In what area did the incident with the Bad Date take place?',
  4 E: 'What happened?',
  5 F: 'Please provide details about what happened with the Bad Date:',
  6 G: 'Your Gender',
  7 H: 'Your Type of Work',
  8 I: 'Bad Date was:',
  9 J: 'Where did the Bad Date make first contact?',
  10 K: 'If Bad Date contacted you through an Ad site, please list advertising website and their handle:',
  11 L: "Bad Date's Name",
  12 M: "Bad Date's Age ",
  13 N: "Bad Date's Phone Number",
  14 O: "Bad Date's E-mail",
  15 P: "Bad Date's Gender",
  16 Q: "Bad Date's race/ethnicity:",
  17 R: "Bad Date's Height",
  18 S: "Bad Date's Body type",
  19 T: 'Any obvious unique identifiable physical attributes?',
  20 U: "Bad Date's Vehicle Info",
  21 V: 'Do you need support?',
  22 W: 'If yes, what kind of support do you need?',
  23 X: 'If yes, please provide contact information for the best way to reach you?',
  24 Y: 'If yes, what name should we call you',
  25 Z: 'If yes, can we say we are calling from St.James?',
  26 A1: 'Additional Comments:',
  27 A2: 'What happened?',
  28 A3: '',
  29 A4: 'Comments:'
*/

// Utility functioning for displaying the results
async function printBDLResponses(responses) {
  for (const response of responses) { 
    console.debug(`${response[0]}: ${response[2]}`);
  }
  return responses;
}

async function saveBDLResponses(responses) {
  console.debug('TODO');
  return responses;
}

// Imports responses from the google/forms/sheets BDL into the mongo/node BDL
// Loop across each report and using the sji-bdl-api try and find the report
//
// The sji-bdl-api/reports/search only returns edited reports, so we will have
// to use one of the admin paths.  sji-bdl-api/admins/reports looks like a good
// candidate but it looks like it only returns edited reports
async function importBDLResponses(google, node) {
  console.debug('node reports ', node);
}

// We should search by date city and bad date name
function isGoogleReportInNode(gReport, node) {
  var gDate = gReport[0];
  var gCity = gReport[2];
  var gBDName = gReport[11];
}

/*
This is what a bad date report looks like from the /api/admins/reports
{
  assaultType: [ 'Robbery', 'Client drunk/high' ],
  edited: false,
  _id: '63cf2fc3e59ffc1509471218',
  city: 'San Francisco',
  locationType: 'Hotel/Motel',
  geolocation: {
    type: 'Point',
    _id: '63cf2fc3e59ffc1509471219',
    coordinates: [ -122.41, 37.77 ]
  },
  gender: 'female',
  date: '2016-05-18T16:00:00.000Z',
  assaultDescription: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse molestie rutrum lorem. Green pants. Cras feugiat nulla augue, eget fringilla odio ultrices a. Duis eu bibendum metus.',
  perpetrator: {
    _id: '63cf2fc3e59ffc150947121a',
    name: 'Bobby',
    phone: '5555555555',
    email: 'test@test.com',
    perpType: 'cop',
    gender: 'male',
    age: '32',
    race: 'white',
    height: "5'10",
    hair: 'black hair',
    attributes: 'tattoo on right arm'
  },
  __v: 0
}
 */

// Exports responses from the mongo/node BDL to the google/forms/sheets BDL
async function exportBDLResponses(responses) {
  console.debug('TODO');
  return responses;
}
// Exports responses from the mongo/node BDL to the google/forms/sheets BDL
async function exportBDLResponses(responses) {
  console.debug('TODO');
  return responses;
}

/*
var gResp = 
authorize()
  .then(getGoogleBDLResponses)
  .then((response) => {
    gResp = response;
    console.debug(gResp);
  })
  .catch(console.error);
*/

getNodeBDLResponses()
  .then((response) => {
    console.log(response);
  });
/*
  */

//importBDLResponses(gResp, nResp);
