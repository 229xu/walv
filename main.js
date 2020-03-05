
var vm = null;


window.onload = function() {
    vm = new Vue(WALV_MAIN);

    /* Initialize the wasm mpy */
    mpylv_init(vm);

    /* Initialize the ace editor */
    editor_init(vm);

    document.title = "WALV: the Online Designer For LittlevGL";
}



var mpylv_init = (vm) => {

    Module.canvas = document.getElementById("canvas");

    /* Bind mp_js_stdout */
    mp_js_stdout = document.getElementById('mp_js_stdout');
    mp_js_stdout.value = "";

    /* Initialize the xtermjs */
    Terminal.applyAddon(fit);
    let term = new Terminal({
      cursorBlink: true,
    //   theme: {
    //     background: '#fdf6e3'
    //   }
    });
    term.open(document.getElementById("mpy_repl"), true);
    term.fit();
    term.write('Welcome To \x1B[1;3;31mWALV\x1B[0m');

    /*Initialize MicroPython itself*/
    mp_js_init(8 * 1024 * 1024);

    /*Setup printing event handler*/
    mp_js_stdout.addEventListener('print', function(e) {
        // console.log(e.data);
        term.write(vm.handle_stdout(e.data));
    }, false);

    /*Setup key input handler */
    term.on('data', function(key, e) {
        for(var i = 0; i < key.length; i++) {
            mp_js_process_char(key.charCodeAt(i));
        }
    });

    /* Run init script */
    mp_js_do_str(EnvInitCode.join('\n'));

    /* Add function querry_attr() & walv_callback() */
    mp_js_do_str(QueryCode.join('\n'));
    wrap_equal("ATTR", JSON.stringify(Getter)); //Add ATTR to mpy, ATTR is common getter

    /*Setup lv_task_handler loop*/
    var the_mp_handle_pending = Module.cwrap('mp_handle_pending', null);
    function handle_pending() {
        the_mp_handle_pending();
        setTimeout(handle_pending, 10); // should call lv_task_handler()
    }

    /*Initialize the REPL.*/
    mp_js_init_repl();

    /*Start the main loop, asynchronously.*/
    handle_pending();
}


var editor_init = (vm) => {
    let editor = ace.edit("code-editor");
    editor.getSession().setUseWrapMode(true);
    editor.setAutoScrollEditorIntoView(true);
    editor.setFontSize(15);
    editor.resize();
    let c_edit_mode = ace.require("ace/mode/c_cpp").Mode;
    let py_edit_mode = ace.require("ace/mode/python").Mode;
    editor.session.setMode(new py_edit_mode());
    editor.setOptions({maxLines: "200px" });
    vm.editor = editor;
    vm.py_edit_mode = py_edit_mode;
    vm.c_edit_mode = c_edit_mode;
}


var WALV_MAIN = {
    el: "#walv",

    data: {
        editor: null,
        c_edit_mode: null,
        py_edit_mode: null,
        is_c_mode: false, //true: c, false: python

        buffer: [],
        str_json: "",
        mask: false,
        currJSON: {},   // The Attributes
        posJSON: {},
        WidgetPool: {},
        InfoPool: {},

        //Simulator
        cursorX: 0,
        cursorY: 0,

        //Creator
        creator_options: WidgetsOption,
        props: {emitPath: false, expandTrigger: 'hover'},
        selected_type: "",
        WidgetNum: 0,
        Count: 0,

        //TreeView
        widget_tree: [
            {
                label: "screen",
                children: []
            },
            // For invisible
            {
                label: "",
                children: []
            }
        ],
        CheckedNode: {
            id: null,
            obj: null,
        },

        //Terminal
        term_visible: true,

        // Style Editor
        style_visible: false,
        style: {
            body: {
                main_color: null,
                grad_color: null,
            },
            text: {
                color: "#409EFF",
                font: "font_roboto_16",
            },
            image: {

            },
            line: {

            },
        }
    },


    watch: {
        //Parse string to JSON
        str_json: function() {
            try {

                let tmp = JSON.parse(this.str_json);
                if(Object.keys(tmp).length == 3) {
                    this.posJSON = tmp;

                    //Update Postion
                    this.WidgetPool[tmp['id']]['x'] = this.posJSON['x'];
                    this.WidgetPool[tmp['id']]['y'] = this.posJSON['y'];

                    this.InfoPool_modify(tmp['id'], 'x');
                    this.InfoPool_modify(tmp['id'], 'y');

                    this.currJSON = this.WidgetPool[tmp['id']];
                } else {
                    this.WidgetPool[tmp['id']] = tmp;
                    this.currJSON = this.WidgetPool[tmp['id']];
                }
            } catch (error) {
                alert(error);
            }
        },

    },

    methods: {
        handle_stdout: function(text) {
            if(text == '\x15')      //End: '\x15'
            {
                this.mask = false;
                this.str_json = this.buffer.join('');
            }                
            if(this.mask)
            {
                this.buffer.push(text);
                text = "";
            }        
            if(text == '\x06')      //Begin: '\x06'
            {
                this.mask = true;
            }

            if(text == '\n')
            {
                this.buffer.splice(0, this.buffer.length);
            }
            return text;
        },

        Creator: function() {
            if (this.selected_type == "") {
                this.$message({
                    message: 'Please select a type',
                    type: 'warning'
                });
            } else {
                let parent_id = this.get_curr_id();
                if (parent_id === null) {
                    this.$message({
                        message: 'You must choose a widget!',
                        type: 'error'
                    });
                    this.CreateWidget(this.selected_type, null);
                }
                if (parent_id == "") {
                    this.$message({
                        message: 'You created a widget invisible',
                        type: 'warning'
                    });
                }
                this.CreateWidget(this.selected_type, parent_id);
            }
        },

        //Parametres are the String type
        CreateWidget: function(type, strPar) {
            var id = this.makeID(type);
            var par = strPar;

            wrap_create(id, par, type);

            //TODO: BUG
            this.append_node(id);

            //** walv saves the inital info to WidgetPool && InfoPool

            //Store Info that a widget was created from.
            this.InfoPool_add(id, par, type);
        },

        // Increase by 1
        makeID: function(type) {
            let id = type + (this.Count++).toString(16);
            this.WidgetNum += 1;
            return id;
        },

        append_node(widget_name) {
            let new_child = {
                label: widget_name,
                children: [] };
            let node = this.$refs.TreeView.getCurrentNode();
            if (node != null) {
                node.children.push(new_child);
            }
        },

        // Delete node and its childs(reverse)
        delete_node: function() {
            const node = this.CheckedNode.obj;
            const id = this.CheckedNode.id;

            if (id == "screen" || id == "") {
                this.$message({
                    message: "You can't delete the screen or nothing!",
                    type: 'error'
                });
                return; // Not support delete screen now
            }
            // delete child
            let tmp = {sum: 1}; // Conut how many child was deleted
            reverse_del_node(node.data, tmp);

            // delete itself
            const children = node.parent.data.children;
            const index = children.findIndex(d => d.label === id);
            wrap_delete(id);
            children.splice(index, 1);
            this.WidgetNum -= tmp.sum;
            // Clear this.CheckedNode
            this.CheckedNode.obj = null;
            this.CheckedNode.id = null

            this.$message({
                message: 'Delete sucessfully',
                type: 'success'
            });
        },

        // https://element.eleme.cn/#/en-US/component/tree
        node_click_cb: function(data, obj, tree_obj) {
            this.CheckedNode.id = data.label;
            this.CheckedNode.obj = obj;

            let id = data.label;
            if (id == "") {// NOTICE
                return;
            }
            if (this.WidgetPool[id] == undefined) {
                let type = "\'obj\'";
                if (id != "screen") {
                    type = this.InfoPool[id]['type'];
                }
                wrap_query_attr(id, type);
            }
            this.currJSON = this.WidgetPool[id];
        },

        cursorXY : function(event) {
            this.cursorX = event.offsetX;
            this.cursorY = event.offsetY;
        },

        get_curr_id: function() {
            return this.CheckedNode.id;
            // node = this.$refs.TreeView.getCurrentNode()
            // if (node != null) {
            //     return node.label;
            // }
            // return null;
        },

        // Lock the widget, so it can't move anymore
        // lock_widget: function() {
        //     let drag_state = this.currJSON["get_drag"];
        //     if(drag_state == true) {
        //         drag_state = "True";
        //     } else {
        //         drag_state = "False";
        //     }

        //     mp_js_do_str(this.currJSON["id"] + ".set_drag(" + drag_state + ')');
        // },


        // Apply change to the widget: number
        bind_widget_num: function(attribute) {

            let value = this.currJSON[attribute];

            if(value == null) {
                value = 0;
            }

            let id = this.currJSON["id"];

            wrap_simple_setter(id, attribute, value);

            this.InfoPool_modify(id, attribute);
        },

        // Apply change to the widget: boolean
        bind_widget_bool: function(attribute) {

            let value = this.currJSON[attribute];

            if(value == true) {
                value = "True"
            } else {
                value = "False"
            }

            let id = this.currJSON["id"];

            wrap_simple_setter(id, attribute, value);

            this.InfoPool_reverse(id, attribute);
        },

        InfoPool_add: function(id, par_name, type) {
            let info = {
                type: type,
                parent: par_name,
                attributes: [],
            };
            this.InfoPool[id] = info;
        },

        // For text or number
        InfoPool_modify: function(id, attribute_name) {
            let index = this.InfoPool[id].attributes.indexOf(attribute_name);
            if (index == -1) {
                this.InfoPool[id].attributes.push(attribute_name);
            }
        },

        //For boolean only
        InfoPool_reverse: function(id, attribute_name) {
            let index = this.InfoPool[id].attributes.indexOf(attribute_name);
            if (index != -1) {
                this.InfoPool[id].attributes.splice(index, 1);
            } else {
                this.InfoPool[id].attributes.push(attribute_name);
            }
        },

        refresh_repl: () =>{wrap_refresh()},

        screenshot: function() {
            document.getElementById("canvas").toBlob((blob) => {
                saveAs(blob, "screenshot.png");
            });
        },

        code_generate: function() {
            let preview_code = python_generator(this.InfoPool, this.WidgetPool);
            this.editor.setValue(preview_code);
            this.$message({
                message: 'Generate code sucessfully',
                type: 'success'
            });
        },

        code_export: function() {
            let code = this.editor.getValue();
            this.$message({
                message: 'Export file sucessfully',
                type: 'success'
            });
            let blob = new Blob([code], {type: "text/plain;charset=utf-8"});
            saveAs(blob, "interface.py");
        },

        make_style: function() {
            wrap_simple_style(this.currJSON["id"], this.style);
        }
    },
}


const reverse_del_node = (node, count) => {
    let childs = node.children;
    for (const iter of childs) {
        reverse_del_node(iter, count);
        wrap_delete(iter.label);
        count.sum += 1;
    }
    childs.splice(0, childs.length);
}