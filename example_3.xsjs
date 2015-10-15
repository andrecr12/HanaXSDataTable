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
    
    // start library with parameters received by HTTP Request $.request.parameters
    // it can be ommited if their values aren't important outside the library
    var inputParams = dataTable.getRequestParameters();

    /**
     *  inputParams : {
     *  	draw: @integer,
     * 
     *  	start: @integer,
     * 
     *  	length: @integer,
     * 
     *  	search: {
     *      	value: @string,
     *			regex: @boolean
     *   	},
     * 
     *  	order: [{
     *      	column: @integer,
     *	      	dir: @string
     *	    }, ...],
     * 
     *  	columns: [{
     *      	data: @string,
     *	      	name: @string,
     *	       	searchable: @boolean,
     *	        orderable: @boolean,
     *	        search: {
     *	        	value: @string,
     *	         	regex: @boolean
     *	        }  
     *      }, ...]
     */
    
    // read parameters received for any purpose ..
    // however, change their values won't take effect on the processing method below

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