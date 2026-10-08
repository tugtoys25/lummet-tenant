document.addEventListener("DOMContentLoaded",()=>{

const button=document.createElement("button");
button.className="level-ai-button";
button.innerHTML="🤖";

const box=document.createElement("div");
box.className="level-ai-box";

box.innerHTML=`
<div class="level-ai-header">
Level AI Assistant
</div>

<div class="level-ai-messages" id="aiMessages">
<div class="ai-msg">
Hello 👋 How can I help you today?
</div>
</div>

<div class="level-ai-input">
<input id="aiInput" placeholder="Ask about casinos..."/>
<button id="aiSend">Send</button>
</div>
`;

document.body.appendChild(button);
document.body.appendChild(box);


button.onclick=()=>{
    box.style.display =
    box.style.display==="flex" ? "none":"flex";
};


const messages=document.getElementById("aiMessages");
const input=document.getElementById("aiInput");
const send=document.getElementById("aiSend");


function addMessage(text,type){

const div=document.createElement("div");
div.className=type==="user"?"user-msg":"ai-msg";
div.textContent=text;

messages.appendChild(div);
messages.scrollTop=messages.scrollHeight;

}


async function askAI(){

const text=input.value.trim();

if(!text)return;

addMessage(text,"user");
input.value="";

addMessage("Thinking...", "ai");


try{

const res=await fetch("/en/api/v1/ai/chat",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
message:text
})
});


const data=await res.json();


messages.lastChild.remove();


addMessage(
data.answer || "I couldn't find an answer yet.",
"ai"
);


}catch(e){

messages.lastChild.remove();

addMessage(
"Sorry, something went wrong.",
"ai"
);

}

}


send.onclick=askAI;


input.addEventListener("keydown",(e)=>{
if(e.key==="Enter"){
askAI();
}
});


});
