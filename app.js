const express = require('express');
const multer = require('multer');
const ejs = require('ejs');
const path = require('path');
const unzip = require('unzip');
const fs = require('fs');
const extract = require('extract-zip');
const resolve = require('path').resolve;
const xpath = require('xpath');
const xpath2 = require('xpath2');
const findInFiles = require('find-in-files');
const dom = require('xmldom').DOMParser;
const fsPromises = require('fs').promises;
const fsExtra = require('fs-extra');
const bodyParser = require('body-parser');
const exec = require('child_process').exec;
const shell = require('shelljs');
const _ = require('underscore');
// Set The Storage Engine
var fileNames;
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function(req, file, cb) {
        cb(null, file.originalname);
    }
});
// Init Upload
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100000000
    },
    fileFilter: function(req, file, cb) {
        checkFileType(file, cb);
    }
}).single('myImage');
// Check File Type
function checkFileType(file, cb) {
    // Allowed ext
    const filetypes = /twx/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);
    if (extname) {
        return cb(null, true);
    } else {
        cb('Error: TWX Files Only!');
    }
}
// Init app
const app = express();
app.use(bodyParser.urlencoded({
    extended: true
}));
// EJS
app.set('view engine', 'ejs');
// Public Folder
app.use(express.static('./public'));
// parse application/json
app.get('/', (req, res) => {
    var fileStatus;
    var message;
    if (fs.readdirSync('./public/uploads').length === 0) {
        fileStatus = false;
        //message = "No TWX is detected. "
    } else {
        fileStatus = true;
        fileNames = fs.readdirSync('./public/uploads');
        //message = fileNames + " is detected. "
    }
    res.render('index', {
        msg: message,
        fileStatus,
        fileNames
    });
});
app.get('/searchTwx', (req, res) => {
    var fileStatus;
    var message;
    var fileNames;
    if (fs.readdirSync('./public/uploads').length === 0) {
        fileStatus = false;
        message = "No TWX is detected. "
    } else {
        fileStatus = true;
        fileNames = fs.readdirSync('./public/uploads');
        //message = fileNames + " is detected. "
    }
    res.render('searchTwx', {
        msg: message,
        fileStatus,
        fileNames
    })
});
app.post('/upload', (req, res) => {
    var fileStatus = false;;
    upload(req, res, (err) => {
        if (err) {
            res.render('index', {
                msg: err,
                fileStatus
            });
        } else {
            if (req.file == undefined) {
                res.render('index', {
                    msg: 'Error: No File Selected!',
                    fileStatus,
                    fileNames
                });
            } else {
                fileStatus = true;
                console.log(req.file.filename);
                var resolvedUnpackPath = resolve(`./public/extractedFiles`);
                extract(`./public/uploads/${req.file.filename}`, {
                    dir: resolvedUnpackPath
                }, function(err) {
                    // handle err
                    console.log(err);
                })
                res.redirect('/searchTwx');
            }
        }
    });
});
app.post('/deleteTwx', (req, res) => {
    deleteTwxs();
    res.redirect('/')
});
app.post('/serchExtracted', (req, res) => {
    var fileStatus = true;;
    console.log(req.body);
    searchFileString = "grep -nlr '/*" + req.body.searchTerm + "/*' ./public/extractedFiles/objects";
    console.log("searchFileString", searchFileString);
    exec(searchFileString, (error, stdout, stderr) => {
        if (error) {
            console.log("errro message", `error: ${error.message}`);
            res.render('searchTwx', {
                msg: "No serach results for : " + req.body.searchTerm,
                fileStatus,
                fileNames
            })
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        //console.log("stdotu",stdout);
        var testArray = stdout.split("\n");
        if (testArray.length) {
            var matchedObjectNames = [];
            testArray.forEach(function(filePath, index) {
                if (filePath) {
                    //console.log(filePath);
                    var matchedObj = {};
                    var assetType = '';
                    var tagLocations = [];
                    var data = fs.readFileSync(filePath, {
                        encoding: 'UTF-8'
                    });
                    var doc = new dom().parseFromString(data);
                    // To Find the Artifact  Names
                    matchedObj.objectName = xpath.select('string((//@name)[1])', doc);
                    if (filePath.includes('/1.')) {
                        assetType = "Service";
                    } else if (filePath.includes('/4.')) {
                        assetType = "UCA"; //
                    } else if (filePath.includes('/7.')) {
                        assetType = "Web Service"; //
                    } else if (filePath.includes('/12.')) {
                        assetType = "Data"; //
                    } else if (filePath.includes('/21.')) {
                        assetType = "EPV"; //
                    } else if (filePath.includes('/24.')) {
                        assetType = "Team"; //
                    } else if (filePath.includes('/25.')) {
                        assetType = "BPD"; //
                    } else if (filePath.includes('/61.')) {
                        assetType = "Managed Asset"; //
                    } else if (filePath.includes('/62.')) {
                        assetType = "ENV"; //
                    } else if (filePath.includes('/63.')) {
                        assetType = "projectDefaults"; //
                    } else if (filePath.includes('/64.')) {
                        assetType = "CoachView";
                    } else if (filePath.includes('/72.')) {
                        assetType = "uiTheme";
                    }
                    //********************************Universal Attribute Level Irrespective of File Type Start *********************************
                    var attrNodexPath = `//@*[contains(., '${req.body.searchTerm}')]`;
                    //console.log("nodexPath", nodexPath);
                    var attrNodes = xpath.select(attrNodexPath, doc);
                    if (attrNodes.length) {
                        for (var i = 0; i < attrNodes.length; i++) {
                            //
                            if (!attrNodes[i].ownerElement.nodeName.includes('ns17:')) {
                                //console.log("attrNodes[i].ownerElement.nodeName ", attrNodes[i].ownerElement.nodeName );
                                var location = attrNodes[i].ownerElement.nodeName;
                                /*
                                if (attrNodes[i].ownerElement.nodeName == "processParameter") {
                                    location = "input/output variable";
                                    //console.log("node Names",attrNodes[i]);
                                } else if (attrNodes[i].ownerElement.nodeName == "processVariable") {
                                    location = "private variable";
                                }
                                */
                                var attrTag = {
                                    'attributVal': attrNodes[i].value,
                                    'attrNodeName': location,
                                    'matchedTerm': 'Do it later'
                                };
                                tagLocations.push(attrTag);
                            }
                            //var attrTag = {'attributVal':attrNodes[i].value, 'attrNodeName': attrNodes[i].ownerElement.nodeName }
                        }
                    }
                    //********************************Universal  Attribute Level Irrespective of File Type End *********************************
                    //********************************Universal Text Level Irrespective of File Type End *********************************
                    var universalTextNodexPath = `//*[text()[contains(., '${req.body.searchTerm}')]]`;
                    //console.log("universalTextNodexPath", universalTextNodexPath);
                    var universalTextNodes = xpath.select(universalTextNodexPath, doc);
                    var mergedList = [].concat(universalTextNodes, attrNodes);
                    //universalTextNodes.concat(attrNodes);
                    //console.log('universalTextNodes.length:: ', mergedList.length ,"universalTextNodes.length::", universalTextNodes.length);
                    if (universalTextNodes.length) {
                        for (var i = 0; i < universalTextNodes.length; i++) {
                            // console.log("universalTextNodes", universalTextNodes[i]);
                            var matchedExactNodeName = universalTextNodes[i].nodeName;
                            var matchedExactNodeData = universalTextNodes[i].firstChild.data;
                            var ancestorList = [universalTextNodes[i].nodeName];
                            //console.log("matchedExactNodeName", matchedExactNodeName);
                            //console.log(".ownerElement.nodeName", universalTextNodes[i].ownerElement);
                            var parentNodeEle = universalTextNodes[i].parentNode;
                            while (parentNodeEle != null) {
                                //console.log("Parent Of ", currentElementName, "is ", parentNodeEle.nodeName);
                                if (parentNodeEle.nodeName == 'process' || parentNodeEle.nodeName == 'teamworks') {
                                    break;
                                }
                                var elementIdentifier = parentNodeEle.nodeName;
                                // Check if the name exists as child node
                                var nodeWithNameTag = _.findWhere(parentNodeEle.childNodes, {
                                    nodeName: "name"
                                });
                                if (nodeWithNameTag) {
                                    //console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",result.firstChild.data);
                                    elementIdentifier += "(" + nodeWithNameTag.firstChild.data + ")";
                                }
                                // Check if name exists as attribute
                                if(parentNodeEle.attributes[0]){
                                   // console.log("###########################---------------------->",parentNodeEle.attributes[0].nodeValue);
                                    elementIdentifier +=  "(" + parentNodeEle.attributes[0].nodeValue + ")";
                                }
                                    
                                
                                
                               
                             
                             
                                ancestorList.push(elementIdentifier);
                                currentElementName = parentNodeEle.nodeName;
                                parentNodeEle = parentNodeEle.parentNode;
                            };
                            // console.log("ancestorList", ancestorList);
                            var pathOfMatcheEl = ancestorList.reverse().join('--->')
                            //console.log("ancestorChain", pathOfMatcheEl);
                            if (!pathOfMatcheEl.includes("bpmn2Model") && !pathOfMatcheEl.includes("jsonData")) {
                                var splittedLinesArray = matchedExactNodeData.split("\n");
                                var matchedLineNumbers = splittedLinesArray.reduce(function(a, e, i) {
                                    if (e.includes(req.body.searchTerm)) a += i + 1 + " ,"
                                    return a;
                                }, []);
                                var formattedLineNums = '';
                                //console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% matchedLineNumbers", matchedLineNumbers);
                                if (typeof matchedLineNumbers === 'string') {
                                    formattedLineNums = matchedLineNumbers.replace(/\,$/, '');
                                }
                                // console.log("formattedLineNums", formattedLineNums);
                                //var keys = Object.keys(exactElementInItem[i]);
                                var attrTag = {
                                    'attributVal': formattedLineNums,
                                    'attrNodeName': pathOfMatcheEl
                                };
                                tagLocations.push(attrTag);
                            }
                        }
                    }
                    //********************************Text Level Irrespective of File Type End *********************************
                    //********************************Text Level Irrespective with 12 File Type Start *********************************
                    // Find the node
                    // Handle Complext object file which starts 
                    var dataProperties = xpath.select(`//teamworks//twClass//definition/property/*[text()[contains(.,'${req.body.searchTerm}')]]`, doc);
                    if (dataProperties) {
                        for (var i = 0; i < dataProperties.length; i++) {
                            var attrTag = {
                                'attributVal': dataProperties[i].childNodes[0].data,
                                'attrNodeName': 'property',
                                'matchedTerm': dataProperties[i].childNodes[0].data
                            };
                            tagLocations.push(attrTag);
                        }
                    }
                    //********************************Text Level Irrespective with 12 File Type End *********************************
                    matchedObjectNames.push(matchedObj);
                    matchedObj['assetType'] = assetType;
                    matchedObj['tagLocations'] = tagLocations;
                }
            });
        } else {
            console.log("reslts not found")
        }
        // console.log("matchedObjectNames",matchedObjectNames);
        res.render('searchTwx', {
            msg: "serach results for : " + req.body.searchTerm,
            fileStatus: true,
            matchedObjectNames,
            fileNames
        })
    });
})
const deleteTwxs = async () => {
    try {
        const extractedDir = "./public/extractedFiles";
        const twxDirectory = "./public/uploads";
        await fsExtra.emptyDirSync(extractedDir);
        await fsExtra.emptyDirSync(twxDirectory);
    } catch (err) {
        console.log("errror deleting twx file and its extracted contents");
    }
}

function testJS() {
    console.log("Test file");
    var data = fs.readFileSync('./public/extractedFiles/objects/1.2a3547d2-c48a-495b-93ce-1e8895fbd864.xml', {
        encoding: 'UTF-8'
    });
    // Create an XMLDom Element:
    var doc = new dom().parseFromString(data);
    //var childNodes = xpath.select('/teamworks/process/item', doc);
    var childNodes = xpath2.select('//teamworks//process/item[name= "Exclusive Gateway"]//*[text()[contains(.,"tw.local.WebServeMonitorConfig.monitorSeq")]]/ancestor::*/name()', doc);
    console.log(childNodes); //
    //var splittedLinesArray = childNodes[0].firstChild.data.split("\n");
    //var index= splittedLinesArray.findIndex(el => el.includes("InstanceCreationTest"));
    //console.log(index+1 );
    /*
        exec('grep -nlr "99999*"  "./public/extractedFiles/objects"' , (error, stdout, stderr) => {
          if (error) {
              console.log(`error: ${error.message}`);
              return;
          }
          if (stderr) {
              console.log(`stderr: ${stderr}`);
              return;
          }
          var testArray=  stdout.split("\n");
          console.log(testArray);
      });
      */
}
//testJS();
const port = 3000;
app.listen(port, () => console.log(`Server started on port ${port}`));