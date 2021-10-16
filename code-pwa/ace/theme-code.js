ace.define("ace/theme/code",["require","exports","module","ace/lib/dom"], function(require, exports, module) {
	exports.isDark = true;
	exports.cssClass = "ace-code";
	exports.cssText = ".ace-code .ace_gutter {\
		background: #323a3d;\
		color: #8F908A\
	}\
	.ace-code .ace_print-margin {\
		width: 1px;\
		background: #555651\
	}\
	.ace-code {\
		background-color: #272d2f;\
		color: #F8F8F2\
	}\
	.ace-code .ace_cursor {\
		color: #F8F8F0\
	}\
	.ace-code .ace_marker-layer .ace_selection {\
		background: #44494c\
	}\
	.ace-code.ace_multiselect .ace_selection.ace_start {\
		box-shadow: 0 0 3px 0px #272d2f;\
	}\
	.ace-code .ace_marker-layer .ace_step {\
		background: rgb(102, 82, 0)\
	}\
	.ace-code .ace_marker-layer .ace_bracket {\
		margin: -1px 0 0 -1px;\
		border: 1px solid #44494c\
	}\
	.ace-code .ace_marker-layer .ace_active-line {\
		background: #202020\
	}\
	.ace-code .ace_gutter-active-line {\
		background-color: #272727\
	}\
	.ace-code .ace_marker-layer .ace_selected-word {\
		border: 1px solid #44494c\
	}\
	.ace-code .ace_invisible {\
		color: #52524d\
	}\
	.ace-code .ace_entity.ace_name.ace_tag,\
	.ace-code .ace_keyword,\
	.ace-code .ace_meta.ace_tag,\
	.ace-code .ace_storage {\
		color: #F92672\
	}\
	.ace-code .ace_punctuation,\
	.ace-code .ace_punctuation.ace_tag {\
		color: #fff\
	}\
	.ace-code .ace_constant.ace_character,\
	.ace-code .ace_constant.ace_language,\
	.ace-code .ace_constant.ace_numeric,\
	.ace-code .ace_constant.ace_other {\
		color: #AE81FF\
	}\
	.ace-code .ace_invalid {\
		color: #F8F8F0;\
		background-color: #F92672\
	}\
	.ace-code .ace_invalid.ace_deprecated {\
		color: #F8F8F0;\
		background-color: #AE81FF\
	}\
	.ace-code .ace_support.ace_constant,\
	.ace-code .ace_support.ace_function {\
		color: #66D9EF\
	}\
	.ace-code .ace_fold {\
		background-color: #A6E22E;\
		border-color: #F8F8F2\
	}\
	.ace-code .ace_storage.ace_type,\
	.ace-code .ace_support.ace_class,\
	.ace-code .ace_support.ace_type {\
		font-style: italic;\
		color: #66D9EF\
	}\
	.ace-code .ace_entity.ace_name.ace_function,\
	.ace-code .ace_entity.ace_other,\
	.ace-code .ace_entity.ace_other.ace_attribute-name,\
	.ace-code .ace_variable {\
		color: #A6E22E\
	}\
	.ace-code .ace_variable.ace_parameter {\
		font-style: italic;\
		color: #FD971F\
	}\
	.ace-code .ace_string {\
		color: #ccffbb\
	}\
	.ace-code .ace_comment {\
		color: #666666\
	}\
	.ace-code .ace_indent-guide {\
		background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAEklEQVQImWPQ0FD0ZXBzd/wPAAjVAoxeSgNeAAAAAElFTkSuQmCC) right repeat-y\
	}";
	
	var dom = require("../lib/dom");
	dom.importCssString(exports.cssText, exports.cssClass);
});
(function() {
    ace.require(["ace/theme/code"], function(m) {
        if (typeof module == "object" && typeof exports == "object" && module) {
            module.exports = m;
        }
    });
})();
            