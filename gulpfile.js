var http = require('http');

var rimraf = require('rimraf'),
		pump = require('pump'),
		colors = require('ansi-colors'),
		st = require('st'),
		argv = require('minimist')(process.argv.slice(2)),
		log = require('fancy-log');

var gulp = require('gulp'),
		noop = require('gulp-noop'),
		livereload = require('gulp-livereload'),
		inject = require('gulp-inject-string'),
		changed = require('gulp-changed'),
		cache = require('gulp-cached'),
		progeny = require('gulp-progeny'),
		filter = require('gulp-filter'),
		sourcemaps = require('gulp-sourcemaps'),
		stylus = require('gulp-stylus'),
		pug = require('gulp-pug'),
		autoprefixer = require('gulp-autoprefixer'),
		uglify = require('gulp-uglify'),
		jshint = require('gulp-jshint');


// ENV Block


var Prod = argv.p || argv.prod;
var Lint = argv.l || argv.lint;
var Maps = argv.m || argv.maps;
var Serv = argv.s || argv.serv;
var Reload = argv.r || argv.reload;


log([
	'Lint ',
	(Lint ? colors.green('enabled') : colors.red('disabled')),
	', sourcemaps ',
	(Maps ? colors.green('enabled') : colors.yellow('disabled')),
	', build in ',
	(Prod ? colors.underline.green('production') : colors.underline.yellow('development')),
	' mode.',
].join(''));

if (Serv) log('Static server ' + colors.green('start') + ' on ' + colors.underline.white('http://localhost:8080'));

if (Reload) log('Livereload server ' + colors.green('start'));


// Flags Block


var build_flags = {
	'-p --prod': 'Builds in ' + colors.underline.green('production') + ' mode (minification, etc).',
	'-d --dev': 'Builds in ' + colors.underline.yellow('development') + ' mode (default).',
	'-l --lint': 'Lint JavaScript code.',
	'-m --maps': 'Generate sourcemaps files.',
	'-s --serv': 'Launch static server for dist folder.',
	'-r --reload': 'Launch livereload server.'
};


// Handlers Block


var errorLogger = function(err) {
	if (err) log([
		'',
		colors.bold.inverse.red('---------- ERROR MESSAGE START ----------'),
		'',
		(colors.red(err.name) + ' in ' + colors.yellow(err.plugin)),
		'',
		err.message,
		colors.bold.inverse.red('----------- ERROR MESSAGE END -----------'),
		''
	].join('\n'));
};

var watchLogger = function(e_type) {
	return function(path, stats) {
		log([
			'File ',
			colors.green(path.replace(__dirname + '/', '')),
			' was ',
			colors.yellow(e_type),
			', running tasks...'
		].join(''));
	};
};

var cacheClean = function(path) {
	delete cache.caches.scripts[path];
	delete cache.caches.styles[path];
	delete cache.caches.templates[path];
};


// Paths Block


var paths = {
	templates: {
		src: 'pug/**/*.pug',
		dest: 'dist'
	},
	styles: {
		src: 'styl/**/*.styl',
		dest: 'dist/css'
	},
	scripts: {
		src: 'js/**/*.js',
		dest: 'dist/js'
	},
	assets: {
		src: 'assets/**',
		dest: 'dist'
	},
	livereload: '<script>document.write(\'<script src="http://\' + (location.host || \'localhost\').split(\':\')[0] + \':35729/livereload.js"></\'+ \'script>\')</script>',
	clean: 'dist/**'
};


// Tasks Block


function clean(callback) {
	return rimraf(paths.clean, callback);
}

function assets() {
	return pump([
		gulp.src(paths.assets.src),
			changed(paths.assets.dest),
		gulp.dest(paths.assets.dest), Reload ? livereload() : noop()
	], errorLogger);
}

function styles() {
	return pump([
		gulp.src(paths.styles.src),
			cache('styles'),
			progeny(),
			filter(['**/*.styl', '!**/_*.styl']),
			Maps ? sourcemaps.init({ loadMaps: true }) : noop(),
			stylus({ compress: Prod }),
			autoprefixer({
				overrideBrowserslist: ['last 12 versions'],
				cascade: !Prod
			}),
			Maps ? sourcemaps.write('.') : noop(),
		gulp.dest(paths.styles.dest), Reload ? livereload() : noop()
	], errorLogger);
}

function scripts() {
	return pump([
		gulp.src(paths.scripts.src),
			cache('scripts'),
			Lint ? jshint({ laxbreak: true, expr: true, '-W041': false }) : noop(),
			Lint ? jshint.reporter('jshint-stylish') : noop(),
			Maps ? sourcemaps.init({ loadMaps: true }) : noop(),
			Prod ? uglify() : noop(),
			Maps ? sourcemaps.write('.', { mapSources: function(path) { return path.split('/').slice(-1)[0]; } }) : noop(),
		gulp.dest(paths.scripts.dest), Reload ? livereload() : noop()
	], errorLogger);
}

function templates() {
	return pump([
		gulp.src(paths.templates.src),
			cache('templates'),
			progeny(),
			filter(['**/*.pug', '!**/_*.pug']),
			pug({'pretty': !Prod}),
			Reload ? inject.before('</head>', paths.livereload) : noop(),
		gulp.dest(paths.templates.dest), !Reload ? livereload() : noop()
	], errorLogger);
}

function watch() {
	gulp.watch(paths.scripts.src, scripts)
			.on('unlink', cacheClean)
			.on('change', watchLogger('changed'))
			.on('add', watchLogger('added'))
			.on('unlink', watchLogger('removed'));

	gulp.watch(paths.templates.src, templates)
			.on('unlink', cacheClean)
			.on('change', watchLogger('changed'))
			.on('add', watchLogger('added'))
			.on('unlink', watchLogger('removed'));

	gulp.watch(paths.styles.src, styles)
			.on('unlink', cacheClean)
			.on('change', watchLogger('changed'))
			.on('add', watchLogger('added'))
			.on('unlink', watchLogger('removed'));

	gulp.watch(paths.assets.src, assets)
			.on('change', watchLogger('changed'))
			.on('add', watchLogger('added'))
			.on('unlink', watchLogger('removed'));
}

function server(callback) {
	if (Reload) livereload.listen({quiet: true});
	if (!Serv) return callback();

	http.createServer(
		st({ path: __dirname + '/dist', index: 'index.html', cache: false })
	).listen(8080, callback);
}


// Exports Block


var task_clean = clean;
		clean.description = 'Clean project folders';

var task_build = gulp.series(clean, gulp.parallel(templates, styles, scripts, assets));
		task_build.description = 'Build all...';
		task_build.flags = build_flags;

var task_default = gulp.series(clean, gulp.parallel(templates, styles, scripts, assets), server, watch);
		task_default.description = 'Build and start watching';
		task_default.flags = build_flags;


exports.build = task_build;
exports.default = task_default;
exports.clean = task_clean;

