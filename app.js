const sendBtn =
document.getElementById("sendBtn");

const input =
document.getElementById("messageInput");

const messages =
document.getElementById("chatMessages");

function addMessage(text,type){

    const msg =
    document.createElement("div");

    msg.classList.add("message");
    msg.classList.add(type);

    msg.textContent = text;

    messages.appendChild(msg);

    messages.scrollTop =
    messages.scrollHeight;
}

function sendMessage(){

    const text =
    input.value.trim();

    if(!text) return;

    addMessage(text,"user");

    input.value="";

    setTimeout(()=>{

        addMessage(
            "Estoy analizando tu consulta legal. Dame unos segundos para ayudarte.",
            "bot"
        );

    },800);
}

sendBtn.addEventListener(
    "click",
    sendMessage
);

input.addEventListener(
    "keydown",
    (e)=>{

        if(e.key==="Enter"){

            sendMessage();
        }
    }
);

document.querySelectorAll(".quick-btn")
.forEach(btn=>{

    btn.addEventListener(
        "click",
        ()=>{

            input.value =
            btn.textContent.trim();

            sendMessage();
        }
    );
});