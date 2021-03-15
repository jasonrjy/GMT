const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');
const mysql = require('mysql');
let db = mysql.createConnection({
    host:'localhost',
    user:'root',
    password:'acyp1723',
    database:'gmt'
});

db.connect();

// db.query("SELECT * from gmt.music WHERE map_mapId = 1", function(err, results, fields) {
//     if (err) {
//         console.log(err);
//     }
//     // console.log(results);
//     // console.log(fields);

//     for (const [index, element] of results.entries()) {
//         console.log(index, element);
//       }
// });

var bodyParser = require('body-parser'); 
const { response } = require('express');
app.use(bodyParser.urlencoded({extended:true})); 
app.use(bodyParser.json());


app.set('views', __dirname + '/views');

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');

let router = require('./router/main.js')(app);

// app.use(express.static('music'));
app.use(express.static(__dirname + 'map'));

let nowName="";
let nowRoomId="";

let count = 1;
let rooms = [];

app.get('/', function(req,res) {
    // res.render('ClientLobby.html');
    res.render('ClientLobby.ejs', {roomList : Object.keys(rooms)});
});

app.get('/accessChatRoom/:roomId', (req, res)=> {

    let room = rooms[req.params.roomId];

    if ( room.music_index == -1) {
        // console.log('can acccess');
        res.json({
            status: 'waiting',
        });
    } else {
        // console.log('playing');
        res.json({
            status: 'playing',
        });
    }
})

app.post('/ClientChatRoom', function(req, res) {
    nowName = req.body.name;
    nowRoomId = req.body.roomId;
    if (io.in(nowRoomId).music_index > -1) {
        res.json(JSON.stringify({
            'play':'playing'
        }));
        
    } else {
        // console.log('render');
        // res.redirect('ClientChatRoom.html');
        let music_list = {};
        mapId = rooms[req.body.roomId].map_id;
        db.query("SELECT * from gmt.music WHERE map_mapId = " + mapId, function(err, results, fields) {
            if (err) {
                console.log(err);
            }
            
            for (const [index, element] of results.entries()) {
                music_list['music'+index] = 'map/'+mapId+'/'+element.id;
            }
            console.log(music_list);
            res.render('ClientChatRoom.ejs', {music_list});
        });

        // let music = {test1 : "test1", test2 : "test2"};
        // music['test3'] = "test3";
        // console.log(music_list);
        
        // res.sendFile(__dirname + '/views/ClientChatRoom.html')
    }
});

app.post('/CreateRoom', function(req, res) {
    let roomId = req.body.roomName;
    let mapId = req.body.mapId;

    createRoom(roomId);
    console.log("create room = "+roomId);

    nowRoomId = roomId;
    res.render('ClientChatRoom.html');

});

app.get('/map/:mapId/:fileName', function(req,res) {
    let filePath = __dirname + '/map/'+req.params.mapId+'/'+req.params.fileName;
    let stat = fs.statSync(filePath);

    range = req.headers.range;
    let readStream;

    if (range !== undefined) {
        var parts = range.replace(/bytes=/, "").split("-");

        var partial_start = parts[0];
        var partial_end = parts[1];

        if ((isNaN(partial_start) && partial_start.length > 1) || (isNaN(partial_end) && partial_end.length > 1)) {
            return res.sendStatus(500); //ERR_INCOMPLETE_CHUNKED_ENCODING
        }

        var start = parseInt(partial_start, 10);
        var end = partial_end ? parseInt(partial_end, 10) : stat.size - 1;
        var content_length = (end - start) + 1;

        res.status(206).header({
            'Content-Type': 'audio/mpeg',
            'Content-Length': content_length,
            'Content-Range': "bytes " + start + "-" + end + "/" + stat.size
        });

        readStream = fs.createReadStream(filePath, {start: start, end: end});
    } else {
        res.header({
            'Content-Type': 'audio/mpeg',
            'Content-Length': stat.size
        });
        readStream = fs.createReadStream(filePath);
    }
    readStream.pipe(res);
});


const default_room_setting = {
    music_index : -1, max_num : 8, 
    skip_vote : 0, skip_num : 0, skip_arr: [], process : 0, 
    score : new Object()
    // , map_info : new Object()
};


function createRoom(roomId, mapId) {
    rooms[roomId] = new Object();
    rooms[roomId].socket_ids = new Object();

    for (let key in default_room_setting) {
        rooms[roomId][key] = default_room_setting[key];
    }

    db.query("SELECT * from gmt.music WHERE map_mapId = " + mapId, function(err, results, fields) {
        if (err) {
            console.log(err);
        }
        rooms[roomId].map_info = [];
        rooms[roomId].map_id = mapId;
        for (const [index, element] of results.entries()) {
            rooms[roomId].map_info.push({
                id : element.id,
                playTime : element.playTime,
                path : element.path,
                answer : [element.answer1, element.answer2, element.answer3],
                hint : [element.hint1, element.hint2, element.hint3]
            });
        }
        
    });

    
}

// fucntion joinRoom(roomId, user_name) {
//     if (!user_name) {
//         socket.emit('change_name', socket.name);
//         user_name = socket.name;
//     }
//     if (roomId == "") {
//         socket.roomId = nowRoomId;
//     }
//     socket.join(socket.roomId);
//     rooms[socket.roomId].socket_ids[user_name] = socket.id;

//     io.to(socket.roomId).emit('join_room', socket.roomId, socket.name);
// }

createRoom('Room1', 1);
createRoom('Room2', 1);


io.on('connection', function(socket){
    console.log('user connected: ', socket.id);

    socket.name = "user"+count++;
    socket.roomId = nowRoomId;

    // io.to(socket.id).emit('get_room_list', room);

    socket.on('disconnect', function() {
        console.log('user disconnected: ', socket.id);

        // console.log(rooms[socket.roomId]);
        // console.log(rooms[socket.roomId].socket_ids[socket.name]);

        if (rooms[socket.roomId].socket_ids[socket.name]) {
            delete rooms[socket.roomId].socket_ids[socket.name];
            io.to(socket.roomId).emit('leave_room', socket.roomId, socket.name);

            // for test
            if (Object.keys(rooms[socket.roomId].socket_ids).length == 0) {
                for (let key in default_room_setting) {
                    rooms[socket.roomId][key] = default_room_setting[key];
                }
            }
        }
    });
    
    socket.on('join_room', (roomId, user_name) => {
        if (!user_name) {
            socket.emit('change_name', socket.name);
            user_name = socket.name;
        }
        if (roomId == "") {
            socket.roomId = nowRoomId;
        }
        socket.join(socket.roomId);
        rooms[socket.roomId].socket_ids[user_name] = socket.id;

        io.to(socket.roomId).emit('join_room', socket.roomId, socket.name);
    });

    socket.on('leave_room', (roomId, user_name) => {
        console.log('leave room event recieve ' +roomId + ' : ' + user_name);
        socket.leave(roomId);
        socket.roomId = "";
    
        console.log(user_name + ' leave a '+ roomId);
        io.to(roomId).emit('leave_room', roomId, user_name);
    });

    socket.on('send_message', function(name, roomId, text) {
        let msg = name + ' : ' + text;

        io.to(roomId).emit('receive_message', roomId, msg);
    });

    socket.on('send_message_in_play', function(name, roomId, text) {

        let room_object = rooms[roomId];
        let music_index = room_object.music_index;
        let ans = room_object.map_info[music_index].answer;

        console.log('send msg, in playing');
        console.log("process : " + room_object.process);
        console.log("music_index : " + music_index);
        console.log("ans : " + ans);

        
        // let ans = rooms[roomId].map_info[music_index][answer];
        // console.log(rooms[roomId].map_info);
        // console.log(rooms[roomId].map_info[music_index]);
        // console.log(rooms[roomId].map_info[music_index].answer);


        let msg = name + ' : ' + text;
        
        io.to(roomId).emit('receive_message', roomId, msg);
        if (room_object.process && ans.includes(text)) {
            room_object.process = 0;
            console.log(room_object.process);
            io.to(roomId).emit('receive_system_message', name + '이 정답을 맞췄습니다!');
        };
    })

    socket.on('play_button_click', (play)=> {
        let room_object = rooms[socket.roomId];

        if (room_object.music_index == -1) {
            room_object.music_index = 0;
            // console.log('/map'+room_object.map_id+'/'+room_object.map_info[room_object.music_index][id]+'.mp3');
            // let stream = fs.createReadStream('/map'+room_object.map_id+'/'+room_object.map_info[room_object.music_index][id]+'.mp3');
            // let count = 0;

            // stream.on('data', function(data) {
            //     count += 1;
            //     console.log(socket.id + ' count = ' + count);
            //     response.write(data);
            // })
            
            io.to(socket.roomId).emit('play_button_click');
            io.to(socket.roomId).emit('play_music', (room_object.music_index));
            room_object.skip_num = io.sockets.adapter.rooms.get(socket.roomId).size;
            room_object.process = 1;
        }
    });

    // socket.on('next_track_click', ()=> {
    //     let room_object = rooms[socket.roomId];
    //     socket.broadcast.to(socket.roomId).emit('next_track_click');
    //     room_object.skip_num = io.sockets.adapter.rooms.get(socket.roomId).size;
    //     room_object.process = 1;
    // });

    socket.on('skip_vote', ()=> {
        console.log('on skip vote');
        let room_object = rooms[socket.roomId];
        if (!room_object.skip_arr.includes(socket.id)) {
            room_object.skip_arr.push(socket.id);
            room_object.skip_vote++;
            if (room_object.skip_vote == room_object.skip_num) {
                room_object.skip_vote = 0;
                room_object.skip_arr = [];
                room_object.process = 1;
                console.log(room_object.process);
                room_object.music_index++;
                room_object.skip_num = io.sockets.adapter.rooms.get(socket.roomId).size;
                io.to(socket.roomId).emit('play_music', (room_object.music_index));
            }
            io.to(socket.roomId).emit('change_skip_vote', room_object.skip_vote);
        }
        
    })
    
    socket.on('set_roomId', (id)=> {
        socket.roomId = id;
    });

    socket.on('create_room', (id, parms)=>{
        createRoom(id, parms);
    })
});

http.listen('3001', function(){
    console.log('Server on!');
});