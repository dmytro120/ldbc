class LDBC
{
	constructor()
	{
		console.log("\x1b[32m", '\r\n'+
			' 888      8888888b.  888888b.    .d8888b.  '+'\r\n'+
			' 888      888  "Y88b 888  "88b  d88P  Y88b '+'\r\n'+
			' 888      888    888 888  .88P  888    888 '+'\r\n'+
			' 888      888    888 8888888K.  888        '+'\r\n'+
			' 888      888    888 888  "Y88b 888        '+'\r\n'+
			' 888      888    888 888    888 888    888 '+'\r\n'+
			' 888      888  .d88P 888   d88P Y88b  d88P '+'\r\n'+
			' 88888888 8888888P"  8888888P"   "Y8888P"  '+'\r\n'
		);
		this.pathToConfig = process.env['LOCALAPPDATA'] + '/LDBC/config.js';
		
		this.fs = require('fs');
		this.dialog = require('dialog');
		this.http = require('http');
		this.httpPort = 7000;
		
		var pool = require('odbc-pool');
		this.pool = new pool({min : 1, max : 10, log : false});
		
		var stdin = process.openStdin(); 
		stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.on('data', this.processKey.bind(this));
		
		process.on('SIGTERM', this.exit.bind(this)).on('SIGINT', this.exit.bind(this));
		
		this.loadConfig();
	}
	
	loadConfig()
	{
		if (this.fs.existsSync(this.pathToConfig)) {
			this.config = require(this.pathToConfig);
			
			if (!this.config.connectionStrings || Object.keys(this.config.connectionStrings).length < 1) {
				this.dialog.err('Cannot start LDBC.\r\n\r\nNo connection strings in config file:\r\n' + this.pathToConfig.replace(/\//g, "\\"), 'LDBC Error', e => {
					process.exit(1);
				});
				return;
			}
			
			console.log(
				'┌────────────────────────────────────────────┐'+'\r\n'+
				'│ LabSys DataBase Connector (LDBC)           │'+'\r\n'+
				'│ http://dmytro.malikov.us/labsys/           │'+'\r\n'+
				'├────────────────────────────────────────────┤'
			);
			var c = 1;
			for (var name in this.config.connectionStrings) {
				console.log('│ ' + (c + ': ' + name + ' '.repeat(42)).slice(0,42) + ' │');
				c++;
			}
			console.log(
				'└────────────────────────────────────────────┘'+'\r\n'
			);
			
			this.openConnection();
		} else {
			this.dialog.err('Cannot start LDBC.\r\n\r\nDB configuration file not found:\r\n' + this.pathToConfig.replace(/\//g, "\\"), 'LDBC Error', e => {
				process.exit(1)
			});
		}
	}
	
	openConnection(key)
	{
		if (!key) key = Object.keys(this.config.connectionStrings)[0];
		console.log('\x1b[0m', 'Connecting to ' + key);
		
		this.pool.open(this.config.connectionStrings[key], (err, client) => {
			this.client = client;
			if (!this.serverOn) this.startServer();
		});
	}
	
	switchConnection(no)
	{
		var targetKey = Object.keys(this.config.connectionStrings)[no-1];
		
		if (targetKey) this.client.close(e => {
			this.openConnection(targetKey);
		});
	}
	
	startServer()
	{
		this.http
			.createServer(this.handleRequest.bind(this))
			.listen(this.httpPort)
			.on('error', err => {
				var exitMsg;
				switch (err.code) {
					case 'EADDRINUSE': exitMsg = 'Cannot start DDBC.\r\nAnother process is using port ' + this.httpPort + '.'; break;
					default: exitMsg = err.message; break;
				}
				this.dialog.err(exitMsg, 'DDBC Error', e => {
					process.exit(1);
				}) 
			});

		console.log('\x1b[36m%s\x1b[0m', " Server running at http://localhost:" + this.httpPort + '\r\n');
		this.serverOn = true;
	}

	handleRequest(request, response)
	{
		response.setHeader('Access-Control-Allow-Origin', '*');

		var urlparts = request.url.split("/");
		var qry = decodeURIComponent(urlparts[1]);

		if (qry == 'favicon.ico') {
			response.end();
			return;
		}
		
		try {
			var rows = this.client.querySync(qry);
		}
		catch(err) {
			response.writeHead(400, {"Content-Type": "text/plain"});
			//console.error(err);
			response.write(err.message);
			response.end();
			return;
		}
		response.writeHead(200, {"Content-Type": "application/json"});
		response.write(JSON.stringify(rows));
		
		response.end();
	}
	
	processKey(key)
	{
		if (key == '\u0003') {
			this.exit();
			return;
		}
		if (key >= '\u0031' && key <= '\u0039') {
			var no = parseInt(key);
			this.switchConnection(no);
		}
	}
	
	exit()
	{
		console.log("\nGoodbye!");
		process.exit(0);
	}
}

new LDBC;