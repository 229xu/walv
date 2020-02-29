
function python_generator(info, widget) {
    let code = [];

    for (const key in info) {
        let id = key;

        let par_id = info[key].parent;

        let type = info[key].type;

        code.push(template_create(id, par_id, type));    //code: create, EX: btn0 = lv.btn(scr)

        const attributes = info[key].attributes;
        for (const attr of attributes) {
            let get_attr = `get_${attr}`;
            let set_attr = `set_${attr}`;
            let value = widget[id][get_attr];
            if (value == true) {
                value = "True";
            } else if (value == false) {
                value = "False";
            }
            code.push(`${id}.${set_attr}(${value})`);
        }
    }

    // console.log(code);
    return code.join("\n");
}


function c_generator(info, widget) {

}