// get env config
const e = process.env || {};

module.exports = {
    APP : {
        URL  : e.APP_URL,
        PORT : e.PORT
    },
    YT : {
        ID  : e.APP_ID,
        KEY : e.APP_KEY
    },
    OS  : {
        ENDPOINT : e.API_EP,
        ID  : e.MALL_ID,
        KEY : e.MALL_KEY
     },
    DB  : {
        host                : e.DB_HOST,
        port                : '3306',
        user                : e.DB_USERNAME,
        password            : e.DB_PASSWORD,
        database            : e.DB_NAME,
        charset             : 'utf8mb4_unicode_ci',
        timezone            : 'UTC+0',
        multipleStatements  : true
    },
    S3 : {
        accessKeyId     : e.S3_ID,
        secretAccessKey : e.S3_KEY,
        region          : e.S3_REGION,
        httpOptions     : {
          timeout : 1800000
        }
    }
}