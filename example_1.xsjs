// import DataTable Server-Side Processing library
var dataTable = $.import("your.package.name", "DataTable");
// or
// var dataTable = $.import("/your/package/name/DataTable.xsjslib");


// connect to Hana
var conn = $.db.getConnection();
app.setSchema(conn, 'MY_SCHEMA');

var output = {};
try {
    var tableName = 'MY_TABLE';
    
    // execute queries and retrieve output parameters expected by DataTable
    output = dataTable.process(conn, tableName);

    $.response.status = $.net.http.OK;
    $.response.contentType = "application/json";
    $.response.setBody(JSON.stringify(output));
} catch(e) {
    
    output = "Exception "+ JSON.stringify(e);
    
    $.response.status = $.net.http.INTERNAL_SERVER_ERROR;
    $.response.contentType = "plain/text";
    $.response.setBody( output );

} finally {
    // close connection to Hana
    conn.close();
}