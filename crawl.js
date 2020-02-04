/* Chrome Bookmarklet

javascript:(function(){window._ctq||document.body.appendChild(function(a){Object.assign(a,{onclick:function(c){delete c.currentTarget.onclick;c.currentTarget.innerHTML="Crawling...";c.preventDefault();c.stopPropagation();var n=document.createElement('script');n.nocrawl=1;n.type="application/javascript";n.src="https://nishimura-katsuo.github.io/Bookmarklet-Crawler/crawl.js";document.head.appendChild(n);},id:"status",innerHTML:"Click to Crawl This Page <i>(Warning: This could download a lot of data, and could take a long time!)</i>"});Object.assign(a.style,{position:"fixed",left:"0px",top:"0px",right:"0px",zIndex:2147483647,textAlign:"center",margin:"0px",padding:"10px",cursor:"pointer",userSelect:"none",font:"normal 14pt Times",backgroundColor:"#FFFFCC",color:"black",boxShadow:"0px 0px 0px 99999px rgba(0,0,0,0.6)"});return a}(document.createElement("div")));window._ctq=1;})();

*/

(() => {
	if (window.crawlRunning) {
		console.warn('Crawl already executed!');

		return ;
	}

	HTMLElement.prototype.createChild = function (tagName, props) {
		let fixedprops = Object.assign({}, props);
		let fixedstyle = fixedprops.style;
		delete fixedprops.style;
		let tmp = document.createElement(tagName);
		Object.assign(Object.assign(tmp, fixedprops).style, fixedstyle);
		this.appendChild(tmp);

		return this;
	};

	let $ = document.getElementById.bind(document);
	let canRequest = /^(http|https|ftp):\/\//;
	let validate = new RegExp('^' + window.location.protocol + '//(\\w*\\.)*' + window.location.host.split('.').slice(-2).join('\\.'));
	let urlLimit = 50000, maxThreads = 5, abort = false;

	$('status').onclick = undefined;
	$('status').innerHTML = '';
	$('status').createChild('span', {
		id: 'statusText',
		style: {
			margin: '5px',
		}
	}).createChild('input', {
		type: 'button',
		value: 'Abort',
		onclick: () => abort = true,
		style: {
			margin: '5px',
		},
	});

	let progress = (a, b, c) => {
		$('statusText').innerHTML = a + '/' + b + ' crawled...';
		document.title = '[Threads] Live: ' + c;
	};

	function reqDoc (url) {
		return new Promise((resolve, reject) => {
			try {
				let req = new XMLHttpRequest();
				req.open('GET', url, true);
				req.responseType = 'document';
				req.onabort = req.onerror = req.ontimeout = reject;
				req.onload = req.onloadend = resolve;
				req.send();
			} catch (e) {
				reject({type: e, target: {}});
			}
		});
	}

	function extractUrls (nodeToCheck, urls = []) {
		if (urls.length >= urlLimit) {
			return urls;
		}

		let addURL = url => {
			if (url && typeof url === 'string') {
				url = url.split('#')[0];
				!urls.includes(url) && urls.push(url);
			}
		};

		for (let c = 0, nodes = [nodeToCheck]; c < nodes.length; c++) {
			if (!nodes[c].nocrawl) {
				nodes.push(...nodes[c].children);
				addURL(nodes[c].href);
				addURL(nodes[c].src);
			}
		}

		if (urls.length > urlLimit) {
			console.warn('More than ' + urlLimit + ' pages to crawl; Truncating list');
			urls = urls.slice(0, urlLimit);
		}

		return urls;
	}

	async function crawl (nodeToCheck = document) {
		let success = [], errors = [], network = [], redirects = [], ignored = [], completed = 0, openRequests = 0;
		console.clear();
		console.log('Crawl started!');
		window.crawlRunning = true;

		await new Promise(resolve => {
			let urls = extractUrls(nodeToCheck), engine = (function *() {
				let advance = () => {
						++completed;

						for (let t = openRequests; t < maxThreads; t++) {
							engine.next();
						}

						progress(completed, urls.length, openRequests);
					}, i = 0;

				while (urls.length !== completed && !abort) {
					if (i < urls.length) {
						if (canRequest.test(urls[i])) {
							let url = urls[i];
							openRequests++;
							reqDoc(url).then(e => {
								openRequests--;

								if (e.target.response && validate.test(e.target.responseURL || url)) {
								//console.log('Digging:', url);
									urls = extractUrls(e.target.response, urls);
								}

								if (e.target.status >= 200 && e.target.status < 300) {
									if (url === e.target.responseURL) {
										success.push({status: e.target.status, url});
									} else {
										redirects.push({status: e.target.status, source: url, target: e.target.responseURL});
									}
								} else {
									errors.push({error: e.target.status, url});
								}

								advance();
							}).catch(e => {
								openRequests--;

								if (e.target && e.target.status) {
									errors.push({error: e.target.status, url});
								} else {
									network.push({url});
								}

								advance();
							});
							progress(completed, urls.length, openRequests);
							yield true;
						} else {
							ignored.push(urls[i]);
							completed++;
							progress(completed, urls.length, openRequests);
						}

						i++;
					} else {
						yield false;
					}
				}

				resolve();
			})();

			for (let t = 0; t < maxThreads; t++) { // chrome supports 6 concurrent connections
				engine.next();
			}
		});

		console.log('Crawl finished!');

		return {urls: success.slice(), errors: errors.slice(), network: network.slice(), redirects: redirects.slice(), ignored: ignored.slice(), count: completed};
	}

	crawl().then(ret => {
		while (document.head.children.length) {
			document.head.children[0].remove();
		}

		while (document.body.children.length) {
			document.body.children[0].remove();
		}

		// monkey-patched because I love extending built-in objects
		document.head.createChild('style', {type: 'text/css', innerText: `
			span, a, p {
				color: inherit;
			}

			html, body {
				background-color: black;
				font-family: monospace;
				font-size: 12pt;
				color: white;
				background-image: none;
				margin: 0px;
				padding: 10px;
			}

			input {
				display: inline-block;
			}

			h2.error, h2.network, h2.redirect, h2.ignored, h2.success {
				cursor: pointer;
				user-select: none;
			}
			
			.error, .network {
				color: #FF0000;
			}

			.redirect {
				color: #0088FF;
			}

			.ignored {
				color: #FF8800;
			}

			.success {
				color: #BBBBBB;
			}
		`.trim().replace(/[ \t\n]+/g, ' ')}).createChild('title', {text: 'Documents: ' + ret.count});

		document.body.createChild('span', {
			innerHTML: 'Find: ',
			hidden: true,
		}).createChild('input', {
			type: 'hidden',
		}).createChild('h2', {
			className: 'error',
			id: 'errorHeader',
			innerHTML: '<span id="errorArrow">-</span>[' + ret.errors.length + '] Errors:',
		}).createChild('pre', {
			className: 'error',
			id: 'error',
			hidden: true,
			innerHTML: (ret.errors.length ? ret.errors.map(err => '[' + err.error + '] <a target=_blank href="' + err.url + '">' + err.url + '</a>').join('\n') : 'None'),
		}).createChild('h2', {
			className: 'network',
			id: 'networkHeader',
			innerHTML: '<span id="networkArrow">-</span>[' + ret.network.length + '] Loading Problems (Network, CORS, etc):',
		}).createChild('pre', {
			className: 'network',
			id: 'network',
			hidden: true,
			innerHTML: (ret.network.length ? ret.network.map(err => '<a target=_blank href="' + err.url + '">' + err.url + '</a>').join('\n') : 'None'),
		}).createChild('h2', {
			className: 'redirect',
			id: 'redirectHeader',
			innerHTML: '<span id="redirectArrow">-</span>[' + ret.redirects.length + '] Successful Redirects:',
		}).createChild('pre', {
			className: 'redirect',
			id: 'redirect',
			hidden: true,
			innerHTML: (ret.redirects.length ? ret.redirects.map(redir => '[' + redir.status + '] <a target=_blank href="' + redir.source + '">' + redir.source + '</a> => <a target=_blank href="' + redir.target + '">' + redir.target + '</a>').join('\n') : 'None'),
		}).createChild('h2', {
			className: 'ignored',
			id: 'ignoredHeader',
			innerHTML: '<span id="ignoredArrow">-</span>[' + ret.ignored.length + '] Ignored:',
		}).createChild('pre', {
			className: 'ignored',
			id: 'ignored',
			hidden: true,
			innerHTML: (ret.ignored.length ? ret.ignored.map(link => '<a target=_blank href="' + link + '">' + link + '</a>').join('\n') : 'None'),
		}).createChild('h2', {
			className: 'success',
			id: 'successHeader',
			innerHTML: '<span id="successArrow">-</span>[' + ret.urls.length + '] Successful:',
		}).createChild('pre', {
			className: 'success',
			id: 'success',
			hidden: true,
			innerHTML: (ret.urls.length ? ret.urls.map(success => '[' + success.status + '] <a target=_blank href="' + success.url + '">' + success.url + '</a>').join('\n') : 'None'),
		});

		document.head.createChild('script', {text: `
			// inlined script
			function onLoad () {
				let $ = document.getElementById.bind(document);
				let toggleVisible = id => () => {
					let hidden = !$(id).hidden;
					$(id).hidden = hidden;
					$(id + 'Arrow').innerText = hidden ? '-' : '+';
				};

				$('errorHeader').onclick = toggleVisible('error');
				$('networkHeader').onclick = toggleVisible('network');
				$('redirectHeader').onclick = toggleVisible('redirect');
				$('ignoredHeader').onclick = toggleVisible('ignored');
				$('successHeader').onclick = toggleVisible('success');
			}

			if(document.readyState === 'loading') {
				window.addEventListener('load', onLoad);
			} else {
				onLoad();
			}
		`.split('\n').slice(1, -1).map(line => line.slice(2)).join('\n')});
	});

})();
