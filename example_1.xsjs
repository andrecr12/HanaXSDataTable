// import DataTable Server-Side Processing library
var dataTable = $.import("csc.dca.web.logic.lib", "DataTable");

// connect to Hana
var conn = $.db.getConnection();
app.setSchema(conn, 'MY_SCHEMA');

var output = {};
try {
    var tableName = 'MY_TABLE';
    
    var dtOptions = dataTable.getRequestParameters();
    
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