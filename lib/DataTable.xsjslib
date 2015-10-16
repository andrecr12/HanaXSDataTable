/**
 * DataTables Server-Side Processing for SAP HANA XS Engine
 * 
 * @authors     André Carrasco (andre.carrasco@gmail.com)
 * @reference   https://datatables.net/manual/server-side
 * @lastModfied September/2015
 * @version     1.0
 */

// SQL Select statement to retrieve table data
var DATA_SELECT_STMT =  'SELECT *               '+
                        '  FROM ${TABLE}        '+
                        ' WHERE 1 = 1           '+
                        '   AND ${FILTERS}      '+
                        '   AND ${ADD_FILTERS}  '+
                        ' ${ORDER_BY}           '+
                        ' LIMIT ${LENGTH}       '+
                        ' OFFSET ${START}       ';

var FILTER_COUNT_STMT = 'SELECT COUNT(*)        '+
                        '  FROM ${TABLE}        '+
                        ' WHERE 1 = 1           '+
                        '   AND ${FILTERS}      '+
                        '   AND ${ADD_FILTERS}  ';

var TOTAL_COUNT_STMT =  'SELECT COUNT(*)        '+
                        '  FROM ${TABLE}        '+
                        ' WHERE 1 = 1           '+
                        '   AND ${ADD_FILTERS}  ';

// request parameters
var params = {
    /**
     *  draw: @integer,
     * 
     *  start: @integer,
     * 
     *  length: @integer,
     * 
     *  search: {
     *      value: @string,
     *      regex: @boolean
     *  },
     * 
     *  order: [{
     *      column: @integer,
     *      dir: @string
     *  }, ...],
     * 
     *  columns: [{
     *      data: @string,
     *      name: @string,
     *      searchable: @boolean,
     *      orderable: @boolean,
     *      search: {
     *          value: @string,
     *          regex: @boolean
     *      }  
     *  }, ...]
     */
};

var globalOptions = {
    /**
     *  columnFormatter: {
     *      'columns[i][data]' : @function,
     *      ...
     *  },
     *  additionalFilters: [{
     *      col: @string,
     *      operator: @string,
     *      value: @string|@number|@date
     *  }, ...]
     */ 
};

// store different type of filters to set on $.db.PreparedStatement
// (must be in different structure to avoid XS parallelism errors)
var filterValues = [];
var additionalFilterValues = [];

/**
 * Reserved terms for different operators using plugin's front-end search
 * Used to expand plugins specific column search capabilities. The JS terms 
 * must be passed to search() function, as follow:
 * 
 * $('#example').DataTable().columns([selector]).search(terms).draw();
 * 
 * Current terms (JavaScript x SQL):
 *  '$isNull$'       IS NULL
 *  '$isNotNull$'    IS NOT NULL
 */

function getRequestParameters(){
    var p = $.request.parameters;
    var reSearch    = /search\[([a-z]+)\]/
      , reArray     = /([a-z]+)\[([0-9]+)\]\[([a-z]+)\](\[([a-z]+)\]){0,1}/;
    var i, index, key;
    
    var filterParamKeys = function(v,k){
        return [0,2].indexOf(k) === -1;
    };
    
    for(i = 0; i < p.length; ++i) {
        if( ['draw','start','length'].indexOf(p[i].name) > -1 ){
            params[p[i].name] = parseInt(p[i].value, 10);
        
        } else if( p[i].name.match(reSearch) ){         // object 'search'
            key = p[i].name.match(reSearch)[1];
            if(!params['search']) 
                params['search'] = {};
            params['search'][key] = (key === 'regex') ? (p[i].value === 'true') : (p[i].value || '');
            
        } else if( p[i].name.match(reArray) ){          // arrays 'order' and 'columns'
            index = parseInt(p[i].name.match(reArray)[2],10);
            key = p[i].name.match(reArray).filter(filterParamKeys);
            // init objects/arrays
            if( !params[key[0]] )
                params[key[0]] = [];
            if( !params[key[0]][index] )
                params[key[0]].push({});
            // set values
            if(key[1] === 'search'){                                    // object 'search'
                if(!params[key[0]][index][key[1]])
                    params[key[0]][index][key[1]] = {};
                params[key[0]][index][key[1]][key[3]] = (key[3] === 'regex') ? (p[i].value === 'true') : (p[i].value || '');
            } else if(['searchable','orderable'].indexOf(key[1]) > -1){ // boolean values
                params[key[0]][index][key[1]] = (p[i].value === 'true');
            } else {                                                    // string values
                params[key[0]][index][key[1]] = (key[1] === 'column') ? parseInt(p[i].value,10) : (p[i].value || '');
            }
        }
    }
    return params;
}

function setOptions(options){
    for(var i in options) {
        globalOptions[i] = options[i];
    }
}

function getOrderClause(){
    var orderBy = '';
    if(params.order instanceof [].constructor){
        for(var i = 0; i < params.order.length; i++){
            if(!i){
                orderBy += ' ORDER BY ';
            } else {
                orderBy += ', ';
            }
            orderBy += params.columns[ params.order[i]['column'] ]['data'] +' '+ params.order[i]['dir'].toUpperCase();
        }
    }
    return orderBy;
}

function getColumnFilter(filter, additionalFilter){
    var filterClause = '';
    
    if(!filter.col || !filter.operator) {
        throw {'function': "DataTable.getColumnFilter", 'exception': "Missing parameter for filtering data"};
    }
    
    if(typeof filter.operator !== 'string') {
        throw {'function': "DataTable.getColumnFilter", 'exception': "Operator parameter must be a string"};
    }
    
    filter.operator = filter.operator.trim().toUpperCase();
    switch(filter.operator){
        case '>':
        case '<':
        case '>=':
        case '<=':
        case '=':
        case '!=':
            filterClause += filter.col +' '+ filter.operator +' ?';
            if(!additionalFilter) {
                filterValues.push(filter.value);
            } else {
                additionalFilterValues.push(filter.value);
            }
        break;
        case 'LIKE':
        case 'NOT LIKE':
            filterClause += filter.col +" "+ filter.operator +" ?";
            if(!additionalFilter) {
                filterValues.push(filter.value.match(/%(.+)%/) ? filter.value : '%'+ filter.value +'%');
            } else{
                additionalFilterValues.push(filter.value.match(/%(.+)%/) ? filter.value : '%'+ filter.value +'%');
            }
        break;
        case 'IS NULL':
        case 'IS NOT NULL':
            filterClause += filter.col +' '+ filter.operator +' ';
        break;
        default:
            throw {
                "function": "DataTable.process", 
                "exception": "Filter operator ${op} not supported"
                                .replace('${op}', filter.operator || 'empty')
            };
    }
    return filterClause;
}

function getDataTableFilter(filter){
    if(!filter.col || !filter.value) {
        throw {'function': "DataTable.getDataTableFilter", 'exception': "Missing parameter for filtering data using plugin inputs"};
    }
    
    var term;
    switch(filter.value){
        case '$isNull$':
            term = getColumnFilter({
                col: filter.col,
                operator: 'IS NULL'
            });
        break;
        case '$isNotNull$':
            term = getColumnFilter({
                col: filter.col,
                operator: 'IS NOT NULL'
            });
        break;
        default:
            term = getColumnFilter({
                col: 'UPPER(TO_CHAR(${col}))'.replace('${col}', filter.col),
                operator: 'LIKE',
                value: filter.value.toUpperCase()
            });
        break;
    }
    return term;
}

function getAdditionalFilterClause(){
    var filterBy = ' 1 = 1 ';
    
    // additional filters
    if(globalOptions.additionalFilters){
        for(var i = 0; i < globalOptions.additionalFilters.length; i++){
            filterBy += ' AND '+ getColumnFilter(globalOptions.additionalFilters[i], true);
        }
    }
    return filterBy;
}

function getTableFilterClause(){
    var i;
    var filterBy = ' 1 = 1 ';
    var multiColSearch = false;     // handles parenthesis closure for multi column search
    
    try {
        // DataTable filter in all searchable columns
        if(typeof params.search.value === 'string' && params.search.value !== ''){
            for(i = 0; i < params.columns.length && params.columns[i].searchable; i++){
                if(!multiColSearch){
                    filterBy += ' AND (';
                    multiColSearch = true;
                } else {
                    filterBy += ' OR ';
                }
                filterBy += getDataTableFilter({
                    col: params.columns[i].data,
                    value: params.search.value
                });
            }
            
            if(multiColSearch) {
                filterBy += ')';
            }
        }
        
        // DataTable filter in a specific field (by parameter 'columns[i][search][value]')
        for(i = 0; i < params.columns.length; i++){
            if(typeof params.columns[i].search.value === 'string' && params.columns[i].search.value !== ''){
                filterBy += ' AND '+ getDataTableFilter({
                    col: params.columns[i].data,
                    value: params.columns[i].search.value
                });
            }
        }
        
        return filterBy;
    } catch(e) {
        throw {location: "DataTable.getTableFilterClause", exception: e};

    }
}

function getColumnIndexes(rsm){
    var columnMap = [null];
    try {
        for(var i = 0; i < rsm.getColumnCount(); i++){
            columnMap.push( rsm.getColumnLabel(i+1) );
        }
        return columnMap;
    } catch(e) {
        throw {location: "DataTable.getColumnIndexes", exception: e};
    }
}

function translateHanaErrors(e, query){
    var msg;
    // reference: https://help.sap.com/saphelp_hanaplatform/helpdata/en/20/a78d3275191014b41bae7c4a46d835/content.htm
    if(e.code){
        switch(e.code){
            case 9:
                msg = 'Index out of bounds during execution of : '+ query;
            break;
            case 257:
                msg = 'SQL Syntax error: '+ query;
            break;
            case 258:
                msg = 'Insufficient privilege to execute: '+ query;
            break;
            case 259:
                msg = 'Invalid table name: '+ query;
            break;
            case 339:
                msg = 'Invalid number on: '+ query;
            break;
            case 340:
                msg = 'Not all variables bound on: '+ query;
            break;
            case 3589:
                msg = 'Remote query execution failure: '+ query;
            break;
            default:
                msg = 'Unknown SQL code error ${num}. Please consult SAP HANA SQL reference.'
                        .replace('${num}', e.code); 
            break;
        }
    }
    return msg;
}
    

function readColumn(rs, rsm, index){
    var value;
    try{
        switch(rsm.getColumnType(index)){
            case $.db.types.DATE:
                value = rs.getDate(index);
            break;
            case $.db.types.DECIMAL:
                value = rs.getDecimal(index);
            break;
            case $.db.types.INTEGER:
                value = rs.getInteger(index);
            break;
            case $.db.types.NVARCHAR:
                value = rs.getString(index);
            break;   
            default:
                value = rs.getString(index);
            break;
        }

        if(globalOptions.columnFormatter){ 
            
            if(typeof globalOptions.columnFormatter[index - 1] === 'function'){
                value = globalOptions.columnFormatter[index - 1](value);
            } else if(typeof globalOptions.columnFormatter[rsm.getColumnName(index)] === 'function'){
                value = globalOptions.columnFormatter[rsm.getColumnName(index)](value);
            }
        }
        
        return value;
    } catch(e) {
        throw {location: "DataTable.readColumn", exception: e};
    }
}

function readLine(rs, rsm){
    var columnMap
      , readByIndex = !!params.columns[0].data.match(/[0-9]+/)
      , line        = (readByIndex) ? [] : {};
    
    try {
        columnMap = getColumnIndexes(rsm);
        for(var col = 0; col < params.columns.length; col++){
            if(readByIndex) {
                line.push( readColumn(rs, rsm, parseInt(params.columns[col].data, 10) + 1) );
            } else {
                line[params.columns[col].data] = readColumn(rs, rsm, columnMap.indexOf(params.columns[col].data));
            }
                
        }
        return line;
    } catch(e) {
        throw {location: "DataTable.readLine", exception: e};
    }
}

function setFilterValues(pstmt, completeFilter){
    var val;
    var allFilters = completeFilter ? filterValues.concat(additionalFilterValues) : additionalFilterValues;
    for(var i = 0 ; i < allFilters.length; i++){
        val = allFilters[i];
        if(val instanceof Date) {
            pstmt.setDate(i+1, val);
        } else if(typeof val === 'number' && (val%1 > 0)) {
            pstmt.setDecimal(i+1, val);
        } else if(typeof val === 'number' && (val%1 === 0)) {
            pstmt.setInteger(i+1, val);
        } else if(typeof val === 'string') {
            pstmt.setNString(i+1, val);
        } else {
            throw {"function": "setFilterValues", "exception": "Filter value not supported on this operation"};
        }
    }
    return filterValues.length;
}

function executeDataQuery(conn, query){
    var pstmt, rs, rsm;
    var col, line;
    var data = [];
    
    try {
        pstmt = conn.prepareStatement(query);
        setFilterValues(pstmt, true);
        rs = pstmt.executeQuery();
        rsm = pstmt.getMetaData();
        
        while(rs.next())
            data.push(JSON.parse(JSON.stringify( readLine(rs, rsm) )));
        
        return data;
    } catch (e) {
        throw {"function": "DataTable.executeDataQuery", "exception": translateHanaErrors(e, query)};
    }
}

function executeCountQuery(conn, query, completeFilter){
    var pstmt, rs, rsm;
    var count = -1;
    
    try {
        pstmt = conn.prepareStatement(query);
        setFilterValues(pstmt, completeFilter);
        rs = pstmt.executeQuery();
        
        while(rs.next()){
            count = rs.getInteger(1);
        }
        return count;
        // return query;
    } catch (e) {
        throw {"function": "DataTable.executeCountQuery", "exception": translateHanaErrors(e, query)};
    }
}

function process(conn, tableName, debug){
    
    try {
        // tableName validation
        if(typeof tableName !== 'string' || tableName === ''){
            throw {'function': "DataTable.process", 'exception': "Param tablename empty"};
        }
        
        // parameters initialization internally (optional)
        if(typeof params.draw !== 'number'){
            getRequestParameters();
        }
        
        var tableFilterClause = getTableFilterClause();
        var additionalFilterClause = getAdditionalFilterClause();
        
        var dataSelect = DATA_SELECT_STMT
                                .replace('${TABLE}', tableName)
                                .replace('${FILTERS}', tableFilterClause)
                                .replace('${ADD_FILTERS}', additionalFilterClause)
                                .replace('${ORDER_BY}', getOrderClause())
                                .replace('${LENGTH}', params['length'])
                                .replace('${START}', params['start']);
        
        var countFiltered = FILTER_COUNT_STMT
                                .replace('${TABLE}', tableName)
                                .replace('${FILTERS}', tableFilterClause)
                                .replace('${ADD_FILTERS}', additionalFilterClause);
        
        var countTotal = TOTAL_COUNT_STMTde
                                .replace('${TABLE}', tableName)
                                .replace('${ADD_FILTERS}', additionalFilterClause);
        
        var out = {
            draw                : params.draw
            , data              : executeDataQuery(conn, dataSelect)
            , recordsFiltered   : executeCountQuery(conn, countFiltered, true)
            , recordsTotal      : executeCountQuery(conn, countTotal, false)
        };
        
        if(debug) {
            out.dataQuery               = dataSelect;
            out.recordsFilteredQuery    = countFiltered;
            out.recordsTotalQuery       = countFiltered;
        }
        
        return out;
        
    } catch(e) {
        return {
            draw: params.draw || -1,
            error: JSON.stringify(e)
        };
    }
}