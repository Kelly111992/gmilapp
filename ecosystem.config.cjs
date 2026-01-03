module.exports = {
    apps: [{
        name: 'gmail-monitor',
        script: 'server.js',
        watch: false,
        env: {
            NODE_ENV: 'production',
            PORT: 5000
        },
        instances: 1,
        exec_mode: 'fork',
        max_memory_restart: '300M',
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }]
};
