let _token = null;
const fs = require('fs').promises;

exports.set = async token=>{
	if (!(_token = token))
		return _token;
		
	await fs.mkdir('data/SpotifyOAuthToken', {recursive: true})
		.then(()=>fs.writeFile('data/SpotifyOAuthToken/token', token));
	return _token;
};
exports.get = async ()=>{
	if (_token)
		return _token;

	try {
		return await fs.readFile('data/SpotifyOAuthToken/token');
	} catch (err) {/**/}
	return '';
};