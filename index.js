const chalk = require('chalk');
const inquirer = require('inquirer');
const got = require('got');
const _ = require('underscore');
const moment = require('moment');
const stream = require('stream');
const {promisify} = require('util');
const pipeline = promisify(stream.pipeline);
const fs = require('fs');
const pressAnyKey = require('press-any-key');

var XC;


function L(level, message){
	switch (level) {
	  	case 'info':
	    	console.log(chalk.bold.cyan(message));
	    	break;
	  	case 'success':
	    	console.log(chalk.bold.green(message));
	    	break;
	    case 'error':
	    	console.log(chalk.bold.red(message));
	    	break;
	    case 'debug':
	    	console.log(message);
	}
}

async function getConfig(){
	L('debug','Loading configuration...');
	
	const sampleConfig = '{\n'+
	'	"url" : "http://king365-tv.co:2103",\n' +
	'	"user" : "USER_ID",\n' +
	'	"pass" : "PASSWORD"\n' +
	'}';

	if (!fs.existsSync(process.cwd()+'/config.json')){
		L('debug','Configuration not found, creating sample file...');
		try {
		    fs.writeFileSync(process.cwd()+'/config.json', sampleConfig);
		    L('success','Configuration file created (config.json)');
		    L('success','Please update your credentials in it');
		    await ex(0);
		} catch (error) {
			L('error', 'Cannot create file on disk. Check access rights.');
			await ex(76);
		}
	}else{
		try{
			XC = require(process.cwd()+'/config.json');
			L('success','Configuration loaded');
		} 
		catch (error){
			L('error', 'Failed to load configuration file');
			await ex(76);
		}
	}
}

async function checkLogin(){
	L('debug','Verifying url and credentials...');
	try {
	    const res = await got.get(XC.url + '/player_api.php?username=' + XC.user + '&password=' + XC.pass);
	 	if (!res.statusCode){
	 		L('error', 'Failed request');
	 		await ex(76);
	 	}
 		if (res.statusCode != 200){
 			L('error', 'Invalid status code: ' + res.statusCode);
 			await ex(76);
 		}
			if (!res.body){
				L('error', 'Empty response');
				await ex(76);
			}
			try{
				var response = JSON.parse(res.body);
			} catch (e){
				L('error', 'Cannot parse body');
				await ex(76);
			}
			if (!response.user_info){
				L('error', 'Invalid body');
				await ex(76);
			}
			if (!response.user_info.auth){
				L('error', 'Wrong credentials');
				await ex(76);
			}

			L('success', 'Connection successful');
	} catch (error){
	 	if (!error.response.statusCode){
	 		L('error', 'Failed request');
	 		await ex(76);
	 	}
	 	L('error', 'Invalid status code: ' + error.response.statusCode);
			await ex(76);
	}
}

async function getChannels(){
	L('debug','Parsing channels...');
	try {
	    const res = await got.get(XC.url + '/player_api.php?username=' + XC.user + '&password=' + XC.pass + '&action=get_live_streams');
	 
		if (!res.statusCode){
	 		L('error', 'Failed request');
	 		await ex(76);
	 	}
 		if (res.statusCode != 200){
 			L('error', 'Invalid status code: ' + res.statusCode);
 			await ex(76);
 		}
		if (!res.body){
			L('error', 'Empty response');
			await ex(76);
		}
		try{
			var channels = JSON.parse(res.body);
		} catch (e){
			L('error', 'Cannot parse body');
			await ex(76);
		}
		if (!Array.isArray(channels)){
			L('error', 'Invalid body');
			await ex(76);
		}

		L('debug',channels.length + ' channels found');
		var catchupChannels = _.where(channels, {tv_archive: 1});
		L('debug',catchupChannels.length + ' channels have catchup');

		catchupChannels = _.map(catchupChannels, function(channel){
			channel.countryCode = channel.name.substring(1,3);
			channel.short = channel.name.substring(5);
			channel.name = channel.name.substring(5).padEnd(40, ' ') + channel.tv_archive_duration.padStart(4, ' ') + ' days';
			channel.value = channel.stream_id;
			return channel;
		});

		catchupChannels = _.groupBy(catchupChannels, function(channel){
			return channel.countryCode;
		})

		return(catchupChannels); 			
	} catch (error){
		if (!error.response.statusCode){
	 		L('error', 'Failed request');
	 		await ex(76);
	 	}
	 	L('error', 'Invalid status code: ' + error.response.statusCode);
			await ex(76);
	}
}

async function downloadFile(url, filename){
	L('debug','Downloading video...');

	try {
		if (!fs.existsSync(process.cwd()+'/downloads')){
		    fs.mkdirSync(process.cwd()+'/downloads');
		}
		var fileStream = fs.createWriteStream(process.cwd()+'/downloads/'+filename+'.mp4');
	} catch (error) {
		L('error', 'Cannot create file on disk. Check access rights.');
		await ex(76);
	}

	try {
		await pipeline(
    		got.stream(url),
    		fileStream
		); 
		L('success', 'Video downloaded: ' + filename + '.mp4');	
		await ex(0);		
	} catch (error){
		if (!error.response.statusCode){
	 		L('error', 'Failed request');
	 		await ex(76);
	 	}
	 	L('error', 'Invalid status code: ' + error.response.statusCode);
			await ex(76);
	}
}

async function ex(code=0){
	console.log();
	await pressAnyKey(" >> Press any key to exit", {
  		ctrlC: "reject"
	})
  	.then(() => {
    	process.exit(code);
  	})
  	.catch(() => {
    	process.exit(code);
  	})
}

async function main(){

	L('info', '');
	L('info', '======= Kicado - King365 catch-up downloader =======');
	L('info', '');

	await getConfig();

	await checkLogin();
	var channels = await getChannels();
	
	L('info', '');

	var questions1 = [
		{
			type: 'list',
    		name: 'country',
    		message: 'Choose the channel country:',
    		choices: _.keys(channels),
    		prefix: chalk.green('>>>'),
		}
	];
	var answers1 = await inquirer.prompt(questions1).then(answers => {
  		return answers
	});
	var choice_country = answers1.country;

	var questions2 = [
		{
			type: 'list',
    		name: 'channel',
    		message: 'Choose the channel:',
    		choices: channels[choice_country],
    		prefix: chalk.green('>>>'),
    		pageSize: 16
		}
	];
	var answers2 = await inquirer.prompt(questions2).then(answers => {
  		return answers
	});
	var choice_channel = _.findWhere(channels[choice_country], {stream_id: answers2.channel});

	var windowEnd = moment();
	var windowStart = moment().subtract(parseInt(choice_channel.tv_archive_duration,10), 'days');
	var timeWindow = []; cur = windowEnd.clone();
	while (cur.isSameOrAfter(windowStart, 'day')){
		timeWindow.push({value: cur.format('YYYY-MM-DD'), name: cur.format('dddd D MMMM YYYY')});
		cur.subtract(1, 'days');
	}

	var questions3 = [
		{
			type: 'list',
    		name: 'date',
    		message: 'Starting date:',
    		choices: timeWindow,
    		prefix: chalk.green('>>>')
		}
	];
	var answers3 = await inquirer.prompt(questions3).then(answers => {
  		return answers
	});
	var choice_date = answers3.date;

	var minHour = '00'; 
	var minMin = '00';
	var maxHour = '23';
	var maxMin = '59';
	if (moment(choice_date).isSame(windowStart, 'day')){
		minHour = windowEnd.format('HH');
		minMin = windowEnd.format('mm');
	}
	if (moment(choice_date).isSame(windowEnd, 'day')){
		maxHour = windowEnd.format('HH');
		maxMin = windowEnd.format('mm');
	}
	var minMinutes = parseInt(minHour,10)*60 + parseInt(minMin,10);
	var maxMinutes = parseInt(maxHour,10)*60 + parseInt(maxMin,10);

	var questions4 = [
		{
			type: 'input',
    		name: 'time',
    		message: 'Starting time ('+minHour+':'+minMin+'~'+maxHour+':'+maxMin+'):',
    		validate: function(input){
    			if (!input.match(/^\d{2}:\d{2}$/)){
    				return 'Invalid format'
    			}
    			var inputs = input.split(':');
    			var inputMinutes = parseInt(inputs[0],10)*60 + parseInt(inputs[1],10);
    			if ((inputMinutes < minMinutes) || (inputMinutes > maxMinutes)) {
    				return 'Not in timeframe'
    			}
   				return true
    		},
    		prefix: chalk.green('>>>')
		},
		{
			type: 'input',
    		name: 'duration',
    		message: 'Duration (in minutes):',
    		validate: function(input){
   				if (!input.match(/^\d+$/)){
    				return 'Invalid format'
    			}
    			return true;
    		},
    		prefix: chalk.green('>>>')
		},
		{
			type: 'input',
    		name: 'filename',
    		message: 'File name:',
    		validate: function(input){
   				if (!input.match(/[a-zA-Z0-9]/)){
    				return 'Invalid format'
    			}
    			return true;
    		},
    		prefix: chalk.green('>>>')
		}
	];
	var answers4 = await inquirer.prompt(questions4).then(answers => {
  		return answers
	});
	var choice_time = answers4.time.split(':');
	var choice_duration = parseInt(answers4.duration,10);
	var choice_filename = answers4.filename.replace(/[^a-zA-Z0-9 _-]+/gi, '');


	await downloadFile(XC.url + '/timeshift/' + XC.user + '/' + XC.pass + '/' + choice_duration + '/' + choice_date + ':' + choice_time[0] + '-' + choice_time[1] + '/' + choice_channel.stream_id + '.hls', choice_filename);
	

}


main();

