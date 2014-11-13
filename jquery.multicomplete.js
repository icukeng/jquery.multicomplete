// при сплите надо понять границы в строке каждого элемента
// при наличии строки
// 1. строка сплитится
// 2. из списка выбирается редактируемый элемент
// 3. список сверяется с хранилищем
// 4. все отстутствующие элементы запрашиваются
// 5. все, всё еще отсутсвующие элементы удаляются
// при автокомплите при этом дополнительно для редактируемого элемента реализуется автокомплит
// при полном ручном вводе проверяются данные при выходе со строки

(function( $ ) {
	// split with metadata
	function taggedsplit(V){
		var R = {};
		V += ',';
		var prev = 0;
		for (var i = 0; i < V.length; i++) {
			if(V[i] == ',') {
				R[prev] = {
					value : V.substr(prev, i - prev).trim(), 
					raw   : V.substr(prev, i - prev),
					start : prev, 
					end   : i,
				};
				prev = i+1;
				continue;
			}
		};
		return R;
	};
	// пересечение локальных данных и нового ввода
	function intersect(list, stor) {
		var loc = jQuery.extend({},stor); // список данных с id
		var del = jQuery.extend({},stor); // будущий список удаленных
		var set = {}; // новые элементы
		var dup = {}; // копия уже существующего
		var sdup = {};// массив для проверки что локульные данные не продублированы
		var loci = null;
		for (var i in list) {
			// проверка самодупликации
			if(sdup[list[i].value] !== undefined) {
				dup[i] = list[i];
				continue;
			} 
			sdup[list[i].value] = 1;

			// провекра хранилища на новые-дубли-удаленные
			loci = loc[list[i].value];
			if(loci !== undefined) {// есть такая в базе
				if(del[list[i].value] !== undefined)  delete del[list[i].value];
				else                                  dup[i] = list[i];
			} else {// нет в базе - новье
				set[i] = list[i];
			};
		};
		return { set:set, dup:dup, del: del};
	};
	// нахрдит и возвращает элемент под курсором, удаляет его из списка
	function processactive(input, position) {
		var active = null;
		for(var i in input)
			if(input[i].start <= position && position <= input[i].end) {
				active = input[i];
				delete input[i];
				break;
			}
		return active;
	};
	// generate new string
	function regenerateValue(input, data, position, dup) {
		var str = '';
		var out = {pos:0, str:'', active:0};
		for (var i in input) {
			// активный кусок - он из базы обычно исключается
			if(input[i].start <= position && position <= input[i].end) {
				//console.log('active');
				// нужно сохранить относительную позицию
				if(str.length) str += ',';// запятая тоже должна учитываться в подсчете
				out.pos = str.length + (position - input[i].start);
				str += input[i].raw;
				out.active = str.length;
				continue;
			}
			// переходный кусок - пустое поле
			if(input[i].start == input[i].end) {
				if(str.length) str += ',';
				str += ' ';
			}
			if(data[input[i].value] === undefined) {// нет в базе
				continue;
			}
			//console.log('std', i);
			//console.dir(status['dup']);
			if(dup[i] !== undefined) continue;
			// есть в базе
			if(str.length) str += ', ';
			str += input[i].value;
		};
		out.str = str;
		return  out;
	};

	$.widget( "ui.multicomplete", $.ui.autocomplete, {
		options: {
			ids: {},
			minLength: 0,
			
			store: null,
			dereference: null,
			query: null,

        },
        state: {},
		_create: function() {
			//console.log('create');
			$(this.element)
			.autocomplete({
				minLength: this.options.minLength,
				source: $.proxy( this, "_onquery" ),
				focus:  function() {/* prevent value inserted on focus */return false;},
				change: $.proxy( this, "_onchange" ),
				select: $.proxy( this, "_onselect" ),
			})
			.bind( "keydown", function( event ) {
			 	if (event.keyCode === $.ui.keyCode.TAB && $( this ).data( "autocomplete" ).menu.active)
			 		event.preventDefault();
			});

		},
		/* subrotine, on collected remote data(server) and local data(status) 
		   perfoms ids update if needed
		*/
		__actualise_ids: function (server, status) {
			var changed = false;
			// есть
			for(var i in server[0]) {//
				//console.log('set', status['set']);
				this.options.ids[status['set'][i].value] = server[0][i];
				changed = true;
			}
			// нет - удаление
			for(var i in status['del']) {
				delete this.options.ids[i];
				changed = true;
			}
			return changed;
		},
		_onquery_response: function() {
			return $.proxy(function(serv) {
				var changed = this.__actualise_ids(serv, this.state.status);
				// удаление dup - фактически отстройка новой строки
				// в ней должны быть все значения с хранилища (оно уже почищено)
				// но в порядке input, за исключением active
				var rez = regenerateValue(this.state.input, this.options.ids, this.state.position, this.state.status['dup'])
				//console.log('new input', str, this.element.get(0).selectionStart, position);
				this.element.val(rez.str);
				this.element.get(0).selectionStart = rez.pos;
				this.element.get(0).selectionEnd = rez.pos;

				if(changed) this.options.store(this.element, this.options.ids);
				this.options.query(this.state.active.value, this.state.response);// TODO тут можно отфильтровать, чтобы не было dup
			}, this);
		},
		_onquery: function( request, response ) {
			this.state.input = taggedsplit(request.term);
			this.state.position = this.element.get(0).selectionStart;
			var passiveinput = jQuery.extend({},this.state.input);
			this.state.active = processactive(passiveinput, this.state.position);
			this.state.status = intersect(passiveinput, this.options.ids); // return new(as input element),dup, deleted(dom collection)
			//console.dir(this.options.ids);
			//console.dir(status);
			// server OK (index-> id), server fail (index->index)
			//this.options.dereference(status['set'], after_responseonsingle);
			this.state.response = response
			this.options.dereference(this.state.status['set'], this._onquery_response());
		},
		_onchange_response: function() {
			return $.proxy(function(serv) {
				var changed = this.__actualise_ids(serv, this.state.status);
				var rez = regenerateValue(this.state.input, this.options.ids, -1, this.state.status['dup']);
				this.element.val(rez.str);

				if(changed) this.options.store(this.element, this.options.ids);
			}, this);
		},
		_onchange: function( event, ui ) {
			// особый случай, пользователь все ввел ручками
			// надо обратиться к сервису и выяснить что есть ли там такое

			// могли вставить вставкой - поэтому все поле признается минным. полная проверка
			var T = this.element.get(0);
			this.state.input = taggedsplit(T.value);
			this.state.position = event.target.selectionStart;
			//var data = this.element.autocomplete('option','ids');
			this.state.status = intersect(this.state.input, this.options.ids);
			this.options.dereference(this.state.status['set'], this._onchange_response());
		},
		_onselect: function( event, ui ) {
			//console.log('select', event, ui, ui.item);
			var T = this.element.get(0);
			var input = taggedsplit(T.value);
			var position = event.target.selectionStart;
			var passiveinput = jQuery.extend({},input); // тут не нужен - но нужен active
			var active = processactive(passiveinput, position);
			// прясое внесение данных - возможен дубль, но тут на это пофиг
			input[active.start].value = ui.item.value;
			input[active.start].raw   = ' '+ui.item.value;
			//var data = this.element.autocomplete('option','ids');
			//data[ui.item.value] = ui.item.id;
			//this.element.autocomplete('option','ids', data);
			this.options.ids[ui.item.value] = ui.item.id;
			var rez = regenerateValue(input, this.options.ids, position, {})
			//console.log(rez.str.length, T.value.length);
			if(T.value.length == rez.pos) { // последний элемент добавили
				T.value = rez.str + ', ';
				T.selectionStart = T.value.length;
				T.selectionEnd = T.value.length;							
			} else { // средний элемент правили
				T.value = rez.str;
				T.selectionStart = rez.active;
				T.selectionEnd = rez.active;							
			}
			this.options.store(this.element, this.options.ids);
			return false;
		},
	});// widget
})( jQuery );
