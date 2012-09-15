//Ace mode setup code derived from: https://github.com/ajaxorg/ace/tree/master/demo (Thanks!)

(function( occEditor, $, undefined ) {
  var editor, modes = [],
      socket = io.connect(),
      dirname;

  var templates = {
    "editor_bar_init":              '<p class="editor-bar-actions">' +
                                      '<a href="" class="open-terminal"><i class="icon-list-alt"></i> Terminal</a>' +
                                      '<i class="icon-edit"></i> Open a file to the left to edit and run.' +
                                    '</p>',
    "editor_bar_blank":             '<p class="editor-bar-actions">' +
                                      '<a href="" class="open-terminal"><i class="icon-list-alt"></i> Terminal</a>' +
                                    '</p>',
    "editor_bar_interpreted_file":  '<p class="editor-bar-actions">' +
                                      '<a href="" class="open-terminal"><i class="icon-list-alt"></i> Terminal</a>' +
                                      '<a href="" class="run-file"><i class="icon-play"></i> Run</a>' +
                                      '<a href="" class="save-file"><i class="icon-cloud"></i> Save</a>' +
                                    '</p>',
    "editor_bar_copy_link":         '<a href="" class="copy-project"><i class="icon-copy"></i> Copy this project to My Pi Projects</a>',
    "editor_bar_tutorial_link":     '<a href="" class="open-tutorial" target="_blank"><i class="icon-book"></i> Project Guide Available</a>',
    "editor_bar_file":              '<p class="editor-bar-actions">' +
                                      '<a href="" class="open-terminal"><i class="icon-list-alt"></i> Terminal</a>' +
                                      '<a href="" class="save-file"><i class="icon-cloud"></i> Save</a>' +
                                    '</p>',
    "create_clone_repository":      'Clone a repository by pasting in the full git ssh url found at Bitbucket or Github.<br/><br/>' +
                                    '<span class="small">Example Read-Only: git://github.com/adafruit/Adafruit-Raspberry-Pi-Python-Code.git</span><br/>' +
                                    '<span class="small">Example Read-Write: git@bitbucket.org:adafruit/adafruit-raspberry-pi-python-code.git</span><br/><br/>' +
                                    'This will also push the latest version of this repository to your Bitbucket account, if it doesn\'t already exist.<br/><br/>' +
                                    '<form id="clone-repository-form" method="post" action="/create/repository">' +
                                      '<label for="repository_url">Remote Repository URL:</label>' +
                                      '<input name="repository_url" type="text">' +
                                    '</form>',
    "create_project_folder":        '<form class="create-form" id="create-project-form">' +
                                      '<a href="" class="create-cancel"><i class="icon-remove-sign"></i></a>' +
                                      '<label for="folder_name">+ Create Project Folder</label>' +
                                      '<div class="create-input-wrapper">' +
                                        '<a class="create-save" href="">Submit</a>' +
                                        '<input name="folder_name" placeholder="Project Name" type="text">' +
                                      '</div>' +
                                    '</form>',
    "create_file_folder":        '<form class="create-form" id="create-file-form">' +
                                      '<a href="" class="create-cancel"><i class="icon-remove-sign"></i></a>' +
                                      '<label for="file_name">+ Create File Folder</label>' +
                                      '<div class="create-input-wrapper">' +
                                        '<a class="create-save" href="">Submit</a>' +
                                        '<input name="file_name" placeholder="File Name" type="text">' +
                                      '</div>' +
                                    '</form>'
  };

  occEditor.path = null;

  occEditor.cwd = function() {
    var cwd;
    if (!occEditor.path) {
      occEditor.path = '';
    }
    //console.log(occEditor.path);
    //console.log(dirname);
    return dirname + occEditor.path.replace('/filesystem', '');
  };

  occEditor.init = function(id) {
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/merbivore_soft");
    editor.getSession().setMode("ace/mode/python");
    occEditor.init_commands(editor);
    occEditor.init_events(editor);
    occEditor.populate_navigator();
    occEditor.populate_editor_bar();
    occEditor.open_readme();

    handle_navigator_actions();
    handle_editor_bar_actions();
    handle_program_output();
  };

  occEditor.init_commands = function(editor) {
    var commands = editor.commands;
    commands.addCommand({
        name: "save",
        bindKey: {win: "Ctrl-S", mac: "Command-S"},
        exec: function() {
          occEditor.save_file();
        }
    });
  };

  occEditor.init_events = function(editor) {
    editor.on('change', function() {
      var editor_content = editor.getSession().getDocument().getValue();
      var $file_element = $('.filesystem li.file-open');
      $file_element.data('content', editor_content).addClass('edited');
      $('a', $file_element).css('font-style', 'italic').text($file_element.data('file').name + '*');
    });

    socket.on('connect', function () {
      $('.connection-state').removeClass('disconnected').addClass('connected').text('Connected');
    });
    socket.on('disconnect', function () {
      $('.connection-state').removeClass('connected').addClass('disconnected').text('Disconnected');
    });
    socket.on('cwd-init', function(data) {
      dirname = data.dirname;
    });
  };

  occEditor.populate_editor = function(file, content) {
    var EditSession = require("ace/edit_session").EditSession;
    var UndoManager = require("ace/undomanager").UndoManager;

    function handler(err, data) {
      file.data = data;
      $(document).trigger('file_open', file);
      var session = new EditSession(data);
      session.setUndoManager(new UndoManager());

      var file_mode = getModeFromPath(file.path);
      session.setMode(file_mode.mode);

      editor.setSession(session);
    }
    if (content) {
      //file has already been opened in this session, and edited
      handler(null, content);
    } else {
      davFS.read(file.path, handler);
    }
    
  };

  occEditor.clear_editor = function() {
    var EditSession = require("ace/edit_session").EditSession;
    var UndoManager = require("ace/undomanager").UndoManager;
    var session = new EditSession('');
    session.setUndoManager(new UndoManager());
    editor.setSession(session);
    //reset editor bar as well
    $('#editor-bar').html(templates.editor_bar_init);
  };

  occEditor.populate_editor_bar = function() {
    var $editor_bar = $('#editor-bar');

    function is_adafruit_project(path) {
      var adafruit_root = "/filesystem/Adafruit-Raspberry-Pi-Python-Code/";
      return (path.indexOf(adafruit_root) !== -1 && path !== adafruit_root);
    }

    function is_script(extension) {
      return (extension === 'py' || extension === 'rb' || extension === 'js');
    }

    function editor_bar_actions(event, file) {
      if (file.extension) {
        if (is_script(file.extension)) {
          $editor_bar.html(templates.editor_bar_interpreted_file);
        } else {
          $editor_bar.html(templates.editor_bar_file);
        }
      }

      if (file.path) {
        if (is_adafruit_project(file.path)) {
          $editor_bar.html(templates.editor_bar_blank);
          var $copy_link = $(templates.editor_bar_copy_link).attr('href', file.path);
          $copy_link.appendTo($('.editor-bar-actions'));
        }
      }

      if (file.data) {
        var als_link = file.data.match(/ALS Guide:[ ]?(.*)$/mi);
        if (als_link && als_link[1] && als_link[1].indexOf("learn.adafruit.com") !== -1) {
          var $tutorial_link = $(templates.editor_bar_tutorial_link).attr('href', als_link[1]);
          $tutorial_link.appendTo($('.editor-bar-actions'));
        }
      }
    }
    $editor_bar.html(templates.editor_bar_init);
    
    $(document).on('file_open', editor_bar_actions);
  };

  occEditor.populate_navigator = function(path) {
    occEditor.path = path;
    path = path || '/filesystem';
    function populateFileSystem(err, list) {
      build_navigator_top(list[0]);
      build_navigator_list(list);
      build_navigator_bottom(list[0]);
      handle_navigator_scroll();
    }

    occEditor.clear_editor();
    $(document).trigger('file_open', {path: path});

    davFS.listDir(path, populateFileSystem);
  };

  occEditor.open_readme = function() {
    var file = {
      path: '/filesystem/my-pi-projects/README.md'
    };
    occEditor.populate_editor(file);
  };

  occEditor.save_file = function(event) {
    if (event) {
      event.preventDefault();
    }

    var file = $('.filesystem li.file-open').data('file');
    $('.filesystem li.file-open').removeClass('edited');
    //reset from italic file
    $('.filesystem li.file-open a').css('font-style', 'normal').text(file.name);
    var editor_content = editor.getSession().getDocument().getValue();

    occEditor.save_edited_files(file, editor_content);
    $('.save-file').html('<i class="icon-ok"></i> Saved').delay(100).fadeOut().fadeIn('slow');
    setTimeout(function() {
      $(document).trigger('file_open', file);
    }, 1500);
  };

  occEditor.save_edited_files = function(file, content) {
    //$('.save-file').html('<i class="icon-cloud"></i> Saving').fadeOut('fast').fadeIn('fast');
    function save_callback(err, status) {
      //TODO Handle save Notification
      //console.log(err);
      //console.log(status);

      //$('.save-file i').removeClass('icon-cloud').addClass('icon-ok');
      socket.emit('commit-file', { file: file});
    }

    davFS.write(file.path, content, save_callback);
  };

  occEditor.open_terminal = function(path, command) {
    var win = new tty.Window(null, path);
    tty.on('open tab', function(){
      tty.on('tab-ready', function() {
        tty.off('open tab');
        tty.off('tab-ready');
        if (command) {
          win.tabs[0].sendString(command);
        }
      });
    });

    var maskHeight = $(window).height();
    var maskWidth = $(window).width();
    var windowTop =  (maskHeight  - $('.window').height())/2;
    var windowLeft = (maskWidth - $('.window').width())/2;
    $('.window').css({ top: windowTop, left: windowLeft, position:"absolute"}).show();
  };

  function build_navigator_top(item) {
    var ul = $(".filesystem").html('');
    //console.log("item.name", item.name);
    if (item.name === 'filesystem') {
      var username = $('input[name="username"]').val();
      $('#navigator-top p').addClass('navigator-item-back').html("<a href=''><i class='icon-user'></i> " + username + "</a><a href='' class='navigator-settings'><i class='icon-cog'></i></a>");
      $('#navigator-folder p').text('All Repositories');
    } else {
      var title = "";
      if (item.parent_name === 'filesystem') {
        title = "All Repositories";
      } else {
        title = item.parent_name;
      }
      $('#navigator-top p').addClass('navigator-item-back').data("file", item).html("<a href=''><i class='icon-chevron-left'></i> " + title + "</a><a href='' class='navigator-settings'><i class='icon-cog'></i></a>");
      $('#navigator-folder p').text(item.name);
    }
  }

  function build_navigator_list(list) {
    var ul = $(".filesystem").html('');
    $.each(list, function(i, item) {
      if (i > 0) {
        item.id = i + "-item";
        $("<li id='" + i + "-item' class='navigator-item'></li>")
        .data( "file", item )
        .append("<a href=''>" + item.name + "</a><i class='icon-chevron-right'></i>")
        .appendTo(ul);
      }
    });
  }

  function build_navigator_bottom(item) {
    //console.log(item);
    var $link = $('.navigator-item-create a');
    var $create_modal = $('#create-modal');
    if (item.name === 'filesystem') {
      $link.text('+ Clone Repository');
      $('h3', $create_modal).text("Clone Repository");
      $('.modal-body p', $create_modal).html(templates.create_clone_repository);
      $('.modal-submit', $create_modal).text('Clone Repository');
    } else if (item.parent_name === 'filesystem') {
      $link.text('+ Create Project Folder');
    } else {
      $link.text('+ Create New File');
    }
  }

  function handle_editor_bar_actions() {


    function run_file(event) {
      event.preventDefault();
      var file = $('.file-open').data('file');
      var editor_content = editor.getSession().getDocument().getValue();

      function run_callback(err, status) {
        //console.log(err);
        //console.log(status);
        var command;
        if (file.extension === 'py') {
          command = "python ";
        } else if (file.extension === 'rb') {
          command = "ruby ";
        } else if (file.extension === 'js') {
          command = "node ";
        }
        command += file.name;

        occEditor.open_terminal(occEditor.cwd(), command);
      }

      davFS.write(file.path, editor_content, run_callback);
    }

    function open_terminal(event) {
      event.preventDefault();

      occEditor.open_terminal(occEditor.cwd(), null);
    }

    function copy_project(event) {
      event.preventDefault();
      var source = $(this).attr('href');
      var path_array = source.split('/');
      var directory = path_array[path_array.length - 2];
      var destination = '/filesystem/my-pi-projects/' + directory;
      
      davFS.copy(source, destination, true, function(err, status) {
        socket.emit('commit-file', { file: {path: destination, name: directory}, message: "Copied to my-pi-projects " + directory});
      });
    }

    $(document).on('click touchstart', '.open-terminal', open_terminal);
    $(document).on('click touchstart', '.copy-project', copy_project);
    $(document).on('click touchstart', '.save-file', occEditor.save_file);
    $(document).on('click touchstart', '.run-file', run_file);
  }

  function handle_program_output() {
    var i = 0;
    var dragging = false;
    var editor_output_visible = false;

    function show_editor_output() {
      if (!editor_output_visible) {
        editor_output_visible = true;
        $('#editor-output').height('150px');
        $('#dragbar').show();
        $('#editor-output div').css('padding', '10px');
        $('#editor').css('bottom', '153px');
      }
    }

    socket.on('program-stdout', function(data) {
      show_editor_output();
      $('#editor-output div pre').append(data.output);
      $("#editor-output").animate({ scrollTop: $(document).height() }, "slow");
      //console.log(data);
    });
    socket.on('program-stderr', function(data) {
      show_editor_output();
      $('#editor-output div pre').append(data.output);
      $("#editor-output").animate({ scrollTop: $(document).height() }, "slow");
      //console.log(data);
    });
    socket.on('program-exit', function(data) {
      show_editor_output();
      $('#editor-output div pre').append("code: " + data.code + '\n');
      $("#editor-output").animate({ scrollTop: $(document).height() }, "slow");
      //console.log(data);
    });

    /*
     * pane resize inspired by...
     * http://stackoverflow.com/questions/6219031/how-can-i-resize-a-div-by-dragging-just-one-side-of-it
    */
    function handle_dragbar_mousedown(event) {
      event.preventDefault();
      dragging = true;
      var $editor = $('#editor-output-wrapper');
      var ghostbar = $('<div>',
                      {id:'ghostbar',
                       css: {
                              top: $editor.offset().top,
                              left: $editor.offset().left,
                              width: $editor.width()
                             }
                      }).appendTo('body');
      $(document).mousemove(function(event){
        ghostbar.css("top",event.pageY+2);
      });
    }

    function handle_dragbar_mouseup(event) {
      var bottom = $(document).height() - event.pageY;

      if (dragging) {
        $('#editor').css("bottom", bottom + 3);
        $('#editor-output').css("height", bottom);
        $('#ghostbar').remove();
        $(document).unbind('mousemove');
        editor.resize();
        dragging = false;
      }
    }

    $('#dragbar').mousedown(handle_dragbar_mousedown);
    $(document).mouseup(handle_dragbar_mouseup);
  }

  function handle_navigator_scroll() {
    //pretty ugly, but seems to work in firefox and chrome so far
    var nav_height = $('#navigator').outerHeight();
    var nav_footer_height = $('#navigator-bottom').outerHeight();
    var nav_top_height = $('#navigator-top').outerHeight();
    var nav_folder_height = $('#navigator-folder').outerHeight();
    //minor hack to force an accurate scrollheight;
    $('#navigator ul').height(0);
    var nav_list_height = $('#navigator ul').prop('scrollHeight');
    var possible_height = nav_height - (nav_footer_height + nav_top_height + nav_folder_height);

    if (nav_list_height < possible_height) {
      $('#navigator ul').height(nav_list_height);
    } else {
      $('#navigator ul').height(possible_height - 4);
    }
  }

  function handle_navigator_actions() {
    var settings_enabled = false;
    function navigator_toggle_settings(event) {
      if (event) {
        event.preventDefault();
      }
      var icon_class;

      if (settings_enabled) {
        settings_enabled = false;
        icon_class = "icon-chevron-right";
      } else {
        settings_enabled = true;
        icon_class = "icon-minus-sign";
      }

      $('.navigator-item i').each(function() {
        $(this).attr('class', icon_class);
      });

    }

    function alert_changed_file() {
      var $edited_elements = $('.filesystem  li.edited');
      if ($('.filesystem li.edited').length > 0) {
        var result = confirm("You have unsaved files in this project.  Would you like to save them?");
        if (result) {
          $edited_elements.each(function() {
            var file = $(this).data('file');
            var content = $(this).data('content');
            $(this).removeClass('edited');
            occEditor.save_edited_files(file, content);
          });
        } else {
          //do nothing, they didn't want to save
        }
      }
    }

    function navigator_delete_item($item) {
      var file = $item.data('file');
      var parent_path = file.parent_path;

      if (file.type === 'directory') {
        davFS.remove(file.path, function(err, status) {
          socket.emit('git-delete', { file: file});
       });
      } else {
        davFS.remove(file.path, function(err, status) {
          socket.emit('git-delete', { file: file});
        });
      }

      $item.remove();
      handle_navigator_scroll();
    }

    function navigator_item_selected(event) {
      event.preventDefault();

      var file = $(this).data('file'), content;

      //user clicked on delete file or folder
      if (event.target.className === 'icon-minus-sign') {
        navigator_delete_item($(this));
        return;
      }

      settings_enabled = false;

      if (file.type === 'directory') {
        alert_changed_file();
        occEditor.populate_navigator(file.path);
      } else {
        $('.filesystem li').removeClass('file-open');
        $(this).addClass('file-open');
        if ($(this).hasClass('edited')) {
          content = $(this).data('content');
        }
        occEditor.populate_editor(file, content);
      }
    }

    function navigator_back_selected(event) {
      event.preventDefault();
      //clicked the settings link
      if (event.target.className === 'icon-cog') {
        return;
      }

      settings_enabled = false;
      alert_changed_file();
      var file = $(this).parent().data('file');
      //console.log(file);
      occEditor.populate_navigator(file.parent_path);
    }

    function navigator_create_selected(event) {
      event.preventDefault();
      var link_text = $('a', this).text();

      if (/repository/i.test(link_text)) {
        $('#create-modal').modal('show');
      } else if (/project/i.test(link_text)) {
        $(this).data('link', $(this).html()).html(templates.create_project_folder);
        $('input[name="folder_name"]').focus();
      } else if (/file/i.test(link_text)) {
        $(this).data('link', $(this).html()).html(templates.create_file_folder);
        $('input[name="file_name"]').focus();
      }
      handle_navigator_scroll();
    }

    function create_modal_submit(event) {
      event.preventDefault();
      var $form = $('#create-modal form');

      if ($form.attr('id') === "clone-repository-form") {
        clone_repository($form);
      }
    }

    function create_cancel(event) {
      var $parent = $(this).closest('p');
      create_replace($parent);
    }

    function create_replace($element) {
      var link = $element.data('link');
      $element.replaceWith('<p class="navigator-item-create">' + link + '</p>');
      handle_navigator_scroll();
    }

    function create_fs_response(err, status) {
      var $create_wrapper = $('.navigator-item-create');
      var folder_name = $('input[name="folder_name"]').val();
      var parent_folder = $('.navigator-item-back').data("file");
      if (err) {
        if (!$create_wrapper.find('.error').length) {
          $create_wrapper.prepend($('<span class="error">' + err + '</span>'));
        } else {
          $('.error', $create_wrapper).replaceWith($('<span class="error">' + err + '</span>'));
        }
        handle_navigator_scroll();
      } else {
        create_replace($create_wrapper);
        occEditor.populate_navigator(parent_folder.path);
        occEditor.populate_editor_bar();
      }
    }

    function create_folder(event) {
      event.preventDefault();
      var $create_wrapper = $('.navigator-item-create');
      var folder_name = $('input[name="folder_name"]').val();
      var parent_folder = $('.navigator-item-back').data("file");
      var path = parent_folder.path + folder_name;
      var item = {path: path, name: folder_name, type: "file"};

      davFS.mkDir(path, function(err, status) {
        socket.emit('commit-file', { file: item });
        create_fs_response(err, status);
      });
    }

    function create_file(event) {
      event.preventDefault();
      var $create_wrapper = $('.navigator-item-create');
      var file_name = $('input[name="file_name"]').val();
      var parent_folder = $('.navigator-item-back').data("file");
      var path = parent_folder.path + file_name;

      davFS.write(parent_folder.path + file_name, '', function(err, status) {
        socket.emit('commit-file', { file: {path: path, name: file_name, type: "file"}});
        create_fs_response(err, status);
      });
    }
    //clicking a file or folder in the list.
    $(document).on('click touchstart', '.navigator-item', navigator_item_selected);
    $(document).on('click touchstart', '.navigator-item-back a:first-child', navigator_back_selected);
    $(document).on('click touchstart', '.navigator-item-create', navigator_create_selected);
    $(document).on('click touchstart', '.navigator-settings', navigator_toggle_settings);
    $(document).on('click touchstart', '#create-modal .modal-submit', create_modal_submit);
    $(document).on('click touchstart', '#create-project-form .create-save', create_folder);
    $(document).on('click touchstart', '#create-project-form .create-cancel', create_cancel);
    $(document).on('click touchstart', '#create-file-form .create-save', create_file);
    $(document).on('click touchstart', '#create-file-form .create-cancel', create_cancel);
    $(document).on('submit', '#create-project-form', create_folder);
    $(document).on('submit', '#create-file-form', create_file);
  }

  function clone_repository($form) {
    function handler(err, data, jqXHR) {
      $('.modal-submit').removeClass('disabled');
      if (jqXHR.status === 200) {
        $('#create-modal').modal('hide');
        occEditor.populate_navigator();
        occEditor.populate_editor_bar();
      } else {
        $('#clone-repository-form').prepend('<span class="error">' + jqXHR.responseText + '</span>');
      }
    }

    var request = $.ajax({
      url: $form.attr('action'),
      type: $form.attr('method'),
      dataType: 'html',
      data: $form.serialize(),
      beforeSend: function(xhr) {
        $('.modal-submit').addClass('disabled');
      }
    }).success(function(data, textStatus, jqXHR) {
      handler(null, textStatus, jqXHR);
    }).fail(function(jqXHR, textStatus) {
      handler(textStatus, null, jqXHR);
    });
  }

  function getModeFromPath(path) {
      var mode = modesByName.text;
      for (var i = 0; i < modes.length; i++) {
          if (modes[i].supportsFile(path)) {
              mode = modes[i];
              break;
          }
      }
      return mode;
  }

  var Mode = function(name, desc, extensions) {
      this.name = name;
      this.desc = desc;
      this.mode = "ace/mode/" + name;
      this.extRe = new RegExp("^.*\\.(" + extensions + ")$", "g");
  };

  Mode.prototype.supportsFile = function(filename) {
      return filename.match(this.extRe);
  };

  var modesByName = {
      c9search:   ["C9Search"     , "c9search_results"],
      coffee:     ["CoffeeScript" , "coffee|^Cakefile"],
      coldfusion: ["ColdFusion"   , "cfm"],
      csharp:     ["C#"           , "cs"],
      css:        ["CSS"          , "css"],
      diff:       ["Diff"         , "diff|patch"],
      golang:     ["Go"           , "go"],
      groovy:     ["Groovy"       , "groovy"],
      haxe:       ["haXe"         , "hx"],
      html:       ["HTML"         , "htm|html|xhtml"],
      c_cpp:      ["C/C++"        , "c|cc|cpp|cxx|h|hh|hpp"],
      clojure:    ["Clojure"      , "clj"],
      java:       ["Java"         , "java"],
      javascript: ["JavaScript"   , "js"],
      json:       ["JSON"         , "json"],
      jsx:        ["JSX"          , "jsx"],
      latex:      ["LaTeX"        , "latex|tex|ltx|bib"],
      less:       ["LESS"         , "less"],
      liquid:     ["Liquid"       , "liquid"],
      lua:        ["Lua"          , "lua"],
      luapage:    ["LuaPage"      , "lp"], // http://keplerproject.github.com/cgilua/manual.html#templates
      markdown:   ["Markdown"     , "md|markdown"],
      ocaml:      ["OCaml"        , "ml|mli"],
      perl:       ["Perl"         , "pl|pm"],
      pgsql:      ["pgSQL"        , "pgsql"],
      php:        ["PHP"          , "php|phtml"],
      powershell: ["Powershell"   , "ps1"],
      python:     ["Python"       , "py"],
      ruby:       ["Ruby"         , "ru|gemspec|rake|rb"],
      scad:       ["OpenSCAD"     , "scad"],
      scala:      ["Scala"        , "scala"],
      scss:       ["SCSS"         , "scss|sass"],
      sh:         ["SH"           , "sh|bash|bat"],
      sql:        ["SQL"          , "sql"],
      svg:        ["SVG"          , "svg"],
      tcl:        ["Tcl"          , "tcl"],
      text:       ["Text"         , "txt"],
      textile:    ["Textile"      , "textile"],
      xml:        ["XML"          , "xml|rdf|rss|wsdl|xslt|atom|mathml|mml|xul|xbl"],
      xquery:     ["XQuery"       , "xq"],
      yaml:       ["YAML"         , "yaml"]
  };

  for (var name in modesByName) {
      var mode = modesByName[name];
      mode = new Mode(name, mode[0], mode[1]);
      modesByName[name] = mode;
      modes.push(mode);
  }

}( window.occEditor = window.occEditor || {}, jQuery ));

$(function () {
  occEditor.init();
  tty.open();
});