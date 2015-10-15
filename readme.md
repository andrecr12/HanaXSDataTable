HanaXSDataTable
======================

A simple SAP HANA XS Engine library to provide Server-Side Processing to the [DataTables](https://datatables.net/), a feature-rich jQuery plugin for table's presentation.

----------
As SAP HANA database has its own in-built back-end service called XS Engine, it turned out to be interesting to develop a XSJS version of the PHP implementation used in the plugin's page. 
Also, as SAP HANA was developed to handle huge amounts of data, the server side processing becomes more relevant since bringing the entire data set to the front-end to be manipulated upon the browser is not the greatest scenario.

Basically, the library returns 3 things:

 1. Paginated, sorted and filtered data from all columns of <u>one table</u>, according to the parameters sent by the front-end plugin;
 2. Total of records of the respective table;
 3. Total of records filtered by the front-end plugin (if any filter was applied)

The library was developed based on the [plugin's manual for server-side processing](https://datatables.net/manual/server-side).

Getting Started
----------------------

As described in the [DataTables page](https://datatables.net/examples/server_side/simple.html), the server-side processing is set when initiating the DataTable component:

    $(document).ready(function() {
        $('#example').DataTable( {
            "processing": true,
            "serverSide": true,
            "ajax": "service.xsjs"
        } );
    } );

Then, a XSJS service must be created following the 2 steps below:

 1. Import the `xsjslib` available inside `lib/`;
 2. Invoke method `process()` of the library, with an available `$.db.Connection` and name of the table.

#### Example 1:

    var dataTable = $.import("your.package.name", "DataTable");
    
    // connect to Hana
    var conn = $.db.getConnection();
    app.setSchema(conn, 'MY_SCHEMA');
    
    try {
        var output = dataTable.process(conn, 'MY_TABLE');
    
        $.response.status = $.net.http.OK;
        $.response.contentType = "application/json";
        $.response.setBody(JSON.stringify(output));
    } catch(e) {
        // handle exception
    } finally {
        // close connection to Hana
        conn.close();
    }
This example can be found on example_1.xsjs

Methods
------------

### **process(conn, tableName [,debug]);**

Parameters:   

 - *conn*: object `$.db.Connection`   
 - *tableName*: string defining the table name
 - *debug*: (optional) boolean that, if set to true, returns the queries executed internally inside the JSON output

Output:  JSON in the correct format to be understood by the plugin

This method does all the work and returns the expected JSON.

### **setOptions(options);**
Parameters:

- *options*: object with two optional keys
    - *additionalFilters*: array of objects defining external filters to be applied to define a sub-set of records inside the table; 
        - *col*: string matching the value of the parameter *columns[i][data]* that identifies the column;
        - *operator*: string with desired operator on this filter. 
                      Available options are >, <, >=, <=, =, !=, LIKE, NOT LIKE, IS NULL, IS NOT NULL.  
        - *value*: string|number with value
    - *columnFormatter*: object listing callbacks to manipulate/format values read from database;

This method enables additional features not covered by the DataTables definition of Server-Side Processing. Its use is optional, however, it may be very handful in different situations.

#### Example 2:
Consider a case where you want to read data from a table below and you'd like to show data a unique Client (or a range them):

| CLIENT_ID | DT_SALES   | TOTAL_SALES |
| :-------- | ---------: | ----------: |
| 123       | 2014-01-03 | 160.00      |
| 123       | 2014-01-05 | 85.00       |
| ...       |            |             |
| 4567      | 2014-01-03 | 110.00      |

The following code would be interesting to filter only data for CLIENT_ID = 123 and to format date and monetary values in the server:    
    
    var dataTable = $.import("your.package.name", "DataTable");
    var conn = $.db.getConnection();
    app.setSchema(conn, 'MY_SCHEMA');
    
    try {        
        dataTable.setOptions({
            additionalFilters: [
                {col: 'CLIENT_ID',  operator: '=', value: 1234},
                ...
            ],
            columnFormatter: {
                'DT_SALES': function(dbValue){
                    // implement date parsing...
                }, 
                'GROSS_AMOUNT': function(dbValue){
                    return 'US$ '+ dbValue;
                }
            },
        });
        
        var output = dataTable.process(conn, 'MY_TABLE');
    
        $.response.status = $.net.http.OK;
        $.response.contentType = "application/json";
        $.response.setBody(JSON.stringify(output));
    } catch(e) {
        // handle exception
    } finally {
        // close connection to Hana
        conn.close();
    }



### **getRequestParameters();**

Output: JSON containing all the parameters received by HTTP request
from front-end plugin.

 

This method provides all the parameter values received from front-end for the XSJS service. It may be useful considering the possibilities of data manipulation by the callbacks set in the method `setOptions`.
An example of this use is in the example_3.xsjs


Additional features
---------------------------

#### Filtering data by NULL OR NOT NULL values
The DataTables plugin does natively support filtering by different operators than "=" (or LIKE, as seen in their example).
However, I extended the filtering capabilities by passing pre-defined string terms to the plugin method [search()](https://datatables.net/reference/api/search%28%29):

     $('#example').DataTable().columns([selector]).search(terms).draw();

The current available terms and the respective SQL command applied are below:

| JavaScript      | SQL         |
| :----------     | ---         |
| '$isNull$'      | IS NULL     |
| '$isNotNull$'   | IS NOT NULL |


Support
-----------

This library was initially developed using SAP HANA rev. 85 and tested in rev. 97 and rev. 102.
As it uses the XS API methods from [$.db](http://help.sap.com/hana/SAP_HANA_XS_JavaScript_API_Reference_en/$.db.html), it is supposed to work on almost all SAP HANA versions available.

The DataTables version used in the development and tests is 1.10.4

References
-----

1. [SAP Hana XS Engine API](http://help.sap.com/hana/SAP_HANA_XS_JavaScript_API_Reference_en/$.html)
2. [DataTables Server-Side Processing Reference](https://datatables.net/manual/server-side)

