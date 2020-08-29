require('dotenv').config()
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server)
const peer = require('peer')
const peerServer = peer.ExpressPeerServer(server,{
    debug:true
})
const { v4:uuidV4 } = require('uuid');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const findOrCreate = require('mongoose-findorcreate')


app.use(express.static('public'));
app.set('view engine','ejs');
app.use('/peerjs',peerServer)
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret:process.env.secret,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true }
  }))

app.use(passport.initialize());
app.use(passport.session())

mongoose.connect('mongodb://localhost:27017/zoomDB',{useNewUrlParser:true,useUnifiedTopology:true})

const zoomSchema = new mongoose.Schema({
    firstName:String,
    lastName:String,
    email:String,
    password:String,
    googleId:String,
    facebookId:String,
    displayName:String
})

zoomSchema.plugin(passportLocalMongoose);
zoomSchema.plugin(findOrCreate);

const Zoom = mongoose.model("Zoom",zoomSchema);

mongoose.set('useCreateIndex', true);

passport.use(Zoom.createStrategy());


passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function(id, done) {
    Zoom.findById(id, function(err, user) {
      done(err, user);
    });
  });

  passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret:process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3030/auth/google/booms",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
    Zoom.findOrCreate({googleId:profile.id,displayName: profile.displayName }, function (err, user) {
      return cb(err, user);
    });
  }
));

passport.use(new FacebookStrategy({
  clientID: process.env.FB_ID,
  clientSecret: process.env.FB_SECRET,
  callbackURL: "http://localhost:3030/auth/facebook/booms"
},
function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
  Zoom.findOrCreate({facebookId: profile.id,displayName:profile.displayName}, function (err, user) {
    return cb(err, user);
  });
}
));

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] }));

  app.get('/auth/google/booms',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/option');
  });

  app.get('/auth/facebook',
  passport.authenticate('facebook'));

  app.get('/auth/facebook/booms',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
    function(req, res) {
      // Successful authentication, redirect home.
      res.redirect('/option');
    });

app.get('/',(req,res)=>{

res.render("home");
});

app.get('/tab',(req,res)=>{
    res.redirect("/"+uuidV4());
})

app.get("/register",(req,res)=>{
    res.render("register");
});



io.on("connection",socket=>{
    socket.on('join-room',(roomId,userId)=>{
        socket.join(roomId)
        socket.to(roomId).broadcast.emit("user-connected",userId)
        socket.on('message',message =>{
            io.to(roomId).emit("createMessage",message)
        })
        socket.on('disconnect', () => {
            socket.to(roomId).broadcast.emit('user-disconnected', userId)
        })
    })

})

app.post('/register',(req,res)=>{
    Zoom.register({username:req.body.username,firstName:req.body.firstName,lastName:req.body.lastName},req.body.password,(err,user)=>{
        if(err)
        {
          console.log(err);
          res.redirect('/register');
        }
        else{
          passport.authenticate("local")(req,res,()=>{
            res.redirect('/option');
          })

        }
      })

})

app.post("/login",(req,res)=>{
    const user = new Zoom({
      username:req.body.username,
      password:req.body.password
    });

    req.login(user,(err)=>{
      if(err){
        console.log(err);
        // alert('email or password is wrong')
        res.redirect('/login');
      }else{
        passport.authenticate("local")(req,res,()=>{
          res.redirect('/option');
        })
      }
    })


  });



app.get("/login",(req,res)=>{
    res.render("login");
})

app.get("/option",(req,res)=>{
    res.render("option")
})

app.get('/joins',(req,res)=>{
  res.render("join")
})

app.post('/open',(req,res)=>{
  console.log(req.body.usersname);
  res.redirect('/'+req.body.usersname)
})

app.get('/:room',(req,res)=>{
  if(req.isAuthenticated())
  {
    res.render('room',{roomId:req.params.room});
  }else{
    res.redirect("/login");
  }

})

const port = process.env.PORT || 3030;



server.listen(port,()=>{
    console.log(`Server running on port ${port}`);
})
